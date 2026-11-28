// A browser type checker for Luau: Luau's own Analysis (the release luau-lsp pins), with the new solver and the
// same setup as `luau-lsp analyze --platform=standard --flag:LuauSolverV2=true --definitions=... --settings=...`.
#include "Luau/AstQuery.h"
#include "Luau/Autocomplete.h"
#include "Luau/BuiltinDefinitions.h"
#include "Luau/Common.h"
#include "Luau/Config.h"
#include "Luau/ExperimentalFlags.h"
#include "Luau/Frontend.h"
#include "Luau/Linter.h"
#include "Luau/Normalize.h"
#include "Luau/UnifierSharedState.h"
#include "Luau/ToString.h"
#include "Luau/TypeInfer.h"

#include <emscripten/bind.h>

#include <cstdio>
#include <cstring>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <set>
#include <vector>

LUAU_FASTFLAG(LuauSolverV2)

namespace
{

// Joins and normalises slash-separated module paths: `a/b/../c` is `a/c`, `./x` is `x`. A `..` above the root stays.
std::string normalisePath(const std::string& path)
{
    std::vector<std::string> parts;
    size_t start = 0;
    while (start <= path.size())
    {
        size_t end = path.find('/', start);
        if (end == std::string::npos)
            end = path.size();
        std::string part = path.substr(start, end - start);
        if (part == "..")
        {
            if (!parts.empty() && parts.back() != "..")
                parts.pop_back();
            else
                parts.push_back(part);
        }
        else if (!part.empty() && part != ".")
            parts.push_back(part);
        start = end + 1;
    }
    std::string out;
    for (const std::string& part : parts)
        out += (out.empty() ? "" : "/") + part;
    return out;
}

std::string directoryOf(const std::string& name)
{
    size_t slash = name.rfind('/');
    return slash == std::string::npos ? "" : name.substr(0, slash);
}

struct MemoryResolver : Luau::FileResolver, Luau::ConfigResolver
{
    std::map<std::string, std::string> sources;
    // `@alias` -> the module directory it stands for (`.luaurc` aliases).
    std::map<std::string, std::string> aliases;
    // Modules with a `require` that found nothing; a later setSource may provide it.
    std::set<std::string> unresolvedFrom;
    Luau::Config config;

    std::optional<Luau::SourceCode> readSource(const Luau::ModuleName& name) override
    {
        auto it = sources.find(name);
        if (it == sources.end())
            return std::nullopt;
        return Luau::SourceCode{it->second, Luau::SourceCode::Module};
    }

    // Luau's require-by-string, over the modules added with setSource: `./x` and `../x` are relative to the requiring
    // module's folder, `@alias/x` to the alias's folder; `x` names `x.luau`, `x.lua`, `x/init.luau` or `x/init.lua`.
    std::optional<Luau::ModuleInfo> resolveModule(const Luau::ModuleInfo* context, Luau::AstExpr* node, const Luau::TypeCheckLimits&) override
    {
        auto* expr = node->as<Luau::AstExprConstantString>();
        if (!expr)
            return std::nullopt;
        std::string path(expr->value.data, expr->value.size);
        std::string base;
        if (path.rfind("./", 0) == 0 || path.rfind("../", 0) == 0)
            base = context ? directoryOf(context->name) : "";
        else if (!path.empty() && path[0] == '@')
        {
            size_t slash = path.find('/');
            auto alias = aliases.find(path.substr(0, slash));
            if (alias == aliases.end())
                return std::nullopt;
            base = alias->second;
            path = slash == std::string::npos ? "" : path.substr(slash + 1);
        }
        else
            return std::nullopt;

        std::string target = normalisePath(base.empty() ? path : base + "/" + path);
        for (const char* suffix : {".luau", ".lua", "/init.luau", "/init.lua"})
        {
            std::string candidate = target + suffix;
            if (sources.count(candidate))
                return Luau::ModuleInfo{candidate};
        }
        if (context)
            unresolvedFrom.insert(context->name);
        return std::nullopt;
    }

    const Luau::Config& getConfig(const Luau::ModuleName&, const Luau::TypeCheckLimits&) const override
    {
        return config;
    }
};

void appendJsonString(std::string& out, const std::string& s)
{
    out += '"';
    for (unsigned char c : s)
    {
        if (c == '"')
            out += "\\\"";
        else if (c == '\\')
            out += "\\\\";
        else if (c == '\n')
            out += "\\n";
        else if (c == '\r')
            out += "\\r";
        else if (c == '\t')
            out += "\\t";
        else if (c < 0x20)
        {
            char buf[8];
            snprintf(buf, sizeof(buf), "\\u%04x", c);
            out += buf;
        }
        else
            out += char(c);
    }
    out += '"';
}

void appendDiagnostic(std::string& out, const std::string& file, const Luau::Location& loc, const char* kind, const std::string& message)
{
    if (out.size() > 1)
        out += ',';
    out += "{\"file\":";
    appendJsonString(out, file);
    out += ",\"line\":" + std::to_string(loc.begin.line + 1) + ",\"column\":" + std::to_string(loc.begin.column + 1);
    out += ",\"endLine\":" + std::to_string(loc.end.line + 1) + ",\"endColumn\":" + std::to_string(loc.end.column + 1);
    out += ",\"kind\":";
    appendJsonString(out, kind);
    out += ",\"message\":";
    appendJsonString(out, message);
    out += '}';
}

// luau-lsp's CLI default: every Luau flag on except the experimental ones, then the new solver on top.
void applyFlags()
{
    for (Luau::FValue<bool>* flag = Luau::FValue<bool>::list; flag; flag = flag->next)
        if (strncmp(flag->name, "Luau", 4) == 0 && !Luau::isAnalysisFlagExperimental(flag->name))
            flag->value = true;
    FFlag::LuauSolverV2.value = true;
}

std::string typeErrorText(const Luau::TypeError& error, Luau::FileResolver* resolver)
{
    if (const auto* syntax = Luau::get_if<Luau::SyntaxError>(&error.data))
        return syntax->message;
    return Luau::toString(error, Luau::TypeErrorToStringOptions{resolver});
}

// Every identifier in a checked module with the type the solver gave it: what an editor shows on hover, collected in
// one pass so a static site can bake them into its code blocks (as TypeScript's Twoslash does).
struct HoverCollector : Luau::AstVisitor
{
    const Luau::Module& module;
    Luau::ToStringOptions options;
    Luau::ToStringOptions expandedOptions;
    // For `expanded`: the normaliser merges an intersection of tables (`A & { b: B }`) into one table.
    Luau::TypeArena arena;
    Luau::InternalErrorReporter ice;
    Luau::UnifierSharedState sharedState{&ice};
    Luau::Normalizer normalizer;
    std::string out = "[";

    HoverCollector(const Luau::Module& module, Luau::NotNull<Luau::BuiltinTypes> builtinTypes)
        : module(module)
        , normalizer(&arena, builtinTypes, Luau::NotNull{&sharedState}, Luau::SolverMode::New)
    {
        options.maxTableLength = 30;
        options.maxTypeLength = 300;
        options.functionTypeArguments = true; // `(level: number) -> ()`, as editors show it
        expandedOptions = options;
        expandedOptions.exhaustive = true;
        expandedOptions.maxTableLength = 60;
        expandedOptions.maxTypeLength = 2000;
    }

    // The type with aliases unfolded and table intersections merged, for a hover that explains what a type is.
    std::string expand(Luau::TypeId ty)
    {
        Luau::TypeId shown = Luau::follow(ty);
        bool hasIntersection = Luau::get<Luau::IntersectionType>(shown) != nullptr;
        if (const auto* u = Luau::get<Luau::UnionType>(shown))
            for (Luau::TypeId option : u->options)
                hasIntersection = hasIntersection || Luau::get<Luau::IntersectionType>(Luau::follow(option)) != nullptr;
        if (hasIntersection)
        {
            try
            {
                if (std::shared_ptr<const Luau::NormalizedType> normal = normalizer.normalize(shown))
                    shown = normalizer.typeFromNormal(*normal);
            }
            catch (const Luau::InternalCompilerError&)
            {
                // Leave it as the solver has it.
            }
        }
        return Luau::toString(shown, expandedOptions);
    }

    void emit(const Luau::Location& loc, const char* kind, const char* name, std::optional<Luau::TypeId> ty)
    {
        if (!ty)
            return;
        if (out.size() > 1)
            out += ',';
        out += "{\"line\":" + std::to_string(loc.begin.line + 1) + ",\"column\":" + std::to_string(loc.begin.column + 1);
        out += ",\"endLine\":" + std::to_string(loc.end.line + 1) + ",\"endColumn\":" + std::to_string(loc.end.column + 1);
        out += ",\"kind\":";
        appendJsonString(out, kind);
        out += ",\"name\":";
        appendJsonString(out, name);
        out += ",\"type\":";
        appendJsonString(out, Luau::toString(*ty, options));
        out += ",\"expanded\":";
        appendJsonString(out, expand(*ty));
        out += '}';
    }

    std::optional<Luau::TypeId> exprType(const Luau::AstExpr* expr) const
    {
        if (const Luau::TypeId* ty = module.astTypes.find(expr))
            return *ty;
        return std::nullopt;
    }

    void declaration(Luau::AstLocal* local)
    {
        Luau::ScopePtr scope = Luau::findScopeAtPosition(module, local->location.end);
        emit(local->location, "local", local->name.value, scope ? scope->lookup(Luau::Symbol(local)) : std::nullopt);
    }

    bool visit(Luau::AstExprLocal* node) override
    {
        emit(node->location, "local", node->local->name.value, exprType(node));
        return true;
    }

    bool visit(Luau::AstExprGlobal* node) override
    {
        emit(node->location, "global", node->name.value, exprType(node));
        return true;
    }

    bool visit(Luau::AstExprIndexName* node) override
    {
        emit(node->indexLocation, "property", node->index.value, exprType(node));
        return true;
    }

    // `local a: T = e`: the annotation's type, else the initializer's (as an editor shows it). The binding in the scope
    // is the solver's unsimplified working type, so it is only the fallback (e.g. for the extra results of a call).
    bool visit(Luau::AstStatLocal* node) override
    {
        for (size_t i = 0; i < node->vars.size; ++i)
        {
            Luau::AstLocal* local = node->vars.data[i];
            std::optional<Luau::TypeId> ty;
            if (local->annotation)
            {
                if (const Luau::TypeId* annotated = module.astResolvedTypes.find(local->annotation))
                    ty = *annotated;
            }
            else if (i < node->values.size && !(i + 1 == node->values.size && i + 1 < node->vars.size))
            {
                // A value that is not the last one feeding several names (a call's results are a pack).
                ty = exprType(node->values.data[i]);
            }
            if (ty)
                emit(local->location, "local", local->name.value, ty);
            else
                declaration(local);
        }
        return true;
    }

    bool visit(Luau::AstStatLocalFunction* node) override
    {
        declaration(node->name);
        return true;
    }

    bool visit(Luau::AstExprFunction* node) override
    {
        for (Luau::AstLocal* arg : node->args)
            declaration(arg);
        return true;
    }

    bool visit(Luau::AstStatFor* node) override
    {
        declaration(node->var);
        return true;
    }

    bool visit(Luau::AstStatForIn* node) override
    {
        for (Luau::AstLocal* local : node->vars)
            declaration(local);
        return true;
    }

    bool visit(Luau::AstType*) override
    {
        return true; // descend into annotations (the default skips them)
    }

    bool visit(Luau::AstTypeReference* node) override
    {
        if (const Luau::TypeId* ty = module.astResolvedTypes.find(node))
            emit(node->nameLocation, "type", node->name.value, *ty);
        return true;
    }
};

} // namespace

class Checker
{
public:
    Checker()
    {
        applyFlags();
        Luau::FrontendOptions options;
        options.retainFullTypeGraphs = true;
        options.runLintChecks = true;
        frontend = std::make_unique<Luau::Frontend>(Luau::SolverMode::New, &resolver, &resolver, options);
        Luau::registerBuiltinGlobals(*frontend, frontend->globals);
    }

    // Loads a definitions file as `@packageName`. Returns a JSON array of its diagnostics (empty when it loaded).
    std::string addDefinitions(const std::string& packageName, const std::string& source)
    {
        std::string out = "[";
        if (frozen)
        {
            appendDiagnostic(out, packageName, Luau::Location{}, "Error", "definitions must be added before the first check");
            return out + "]";
        }
        Luau::LoadDefinitionFileResult result =
            frontend->loadDefinitionFile(frontend->globals, frontend->globals.globalScope, source, packageName, /* captureComments */ true);
        for (const auto& error : result.parseResult.errors)
            appendDiagnostic(out, packageName, error.getLocation(), "SyntaxError", error.getMessage());
        if (result.module)
            for (const auto& error : result.module->errors)
                appendDiagnostic(out, packageName, error.location, "TypeError", typeErrorText(error, &resolver));
        if (!result.success && out.size() == 1)
            appendDiagnostic(out, packageName, Luau::Location{}, "Error", "the definitions file did not load");
        return out + "]";
    }

    // luau-lsp's `types.disabledGlobals`: a name (`os`) or a library member (`table.clone`) removed from the globals.
    bool disableGlobal(const std::string& name)
    {
        if (frozen)
            return false;
        std::string library = name;
        std::optional<std::string> member;
        if (size_t dot = name.find('.'); dot != std::string::npos)
        {
            library = name.substr(0, dot);
            member = name.substr(dot + 1);
        }
        Luau::AstName globalName =frontend->globals.globalNames.names->get(library.c_str());
        if (globalName.value == nullptr)
            return false;
        auto& bindings = frontend->globals.globalScope->bindings;
        auto binding = bindings.find(globalName);
        if (binding == bindings.end())
            return false;
        if (!member)
        {
            bindings.erase(globalName);
            return true;
        }
        Luau::TypeId ty = Luau::follow(binding->second.typeId);
        if (auto ttv = Luau::getMutable<Luau::TableType>(ty))
            return ttv->props.erase(*member) > 0;
        if (auto etv = Luau::getMutable<Luau::ExternType>(ty))
            return etv->props.erase(*member) > 0;
        return false;
    }

    void setSource(const std::string& name, const std::string& source)
    {
        freeze();
        bool added = resolver.sources.count(name) == 0;
        resolver.sources[name] = source;
        frontend->markDirty(name);
        // A new module may be what an earlier `require` failed to find: check those modules again.
        if (added)
        {
            for (const std::string& requirer : resolver.unresolvedFrom)
                frontend->markDirty(requirer);
            resolver.unresolvedFrom.clear();
        }
    }

    // `.luaurc`-style alias: `require("@name/x")` looks for `x` under `directory` (a module path prefix).
    void setAlias(const std::string& name, const std::string& directory)
    {
        resolver.aliases[name.rfind('@', 0) == 0 ? name : "@" + name] = normalisePath(directory);
        for (const auto& [module, _] : resolver.sources)
            frontend->markDirty(module);
    }

    void removeSource(const std::string& name)
    {
        resolver.sources.erase(name);
        frontend->markDirty(name);
    }

    // Checks one module; returns a JSON array of type errors and lint warnings, as `luau-lsp analyze` prints them.
    std::string check(const std::string& name)
    {
        freeze();
        std::string out = "[";
        try
        {
            Luau::CheckResult result = frontend->check(name);
            for (const auto& error : result.errors)
            {
                if (error.moduleName != name)
                    continue; // a required module's own errors belong to that module's check
                const char* kind = Luau::get_if<Luau::SyntaxError>(&error.data) ? "SyntaxError" : "TypeError";
                appendDiagnostic(out, error.moduleName, error.location, kind, typeErrorText(error, &resolver));
            }
            for (const auto& lint : result.lintResult.errors)
                appendDiagnostic(out, name, lint.location, Luau::LintWarning::getName(lint.code), lint.text);
            for (const auto& lint : result.lintResult.warnings)
                appendDiagnostic(out, name, lint.location, Luau::LintWarning::getName(lint.code), lint.text);
        }
        catch (const Luau::InternalCompilerError& ice)
        {
            appendDiagnostic(out, name, ice.location ? *ice.location : Luau::Location{}, "InternalCompilerError", ice.message);
        }
        return out + "]";
    }

    // The mode of a module with no `--!strict` or `--!nonstrict` comment (luau-lsp's default is nonstrict).
    void setStrict(bool strict)
    {
        resolver.config.mode = strict ? Luau::Mode::Strict : Luau::Mode::Nonstrict;
        for (const auto& [name, _] : resolver.sources)
            frontend->markDirty(name);
    }

    // The type of the expression at a 0-based position, after `check`; empty when there is none.
    std::string typeAt(const std::string& name, unsigned line, unsigned column)
    {
        Luau::ModulePtr module = frontend->moduleResolver.getModule(name);
        const Luau::SourceModule* source = frontend->getSourceModule(name);
        if (!module || !source)
            return "";
        Luau::Position position{line, column};
        std::optional<Luau::TypeId> ty = Luau::findTypeAtPosition(*module, *source, position);
        if (!ty)
        {
            // A local's name (in its declaration or a use): look it up in the scope at that position.
            Luau::ExprOrLocal node = Luau::findExprOrLocalAtPosition(*source, position);
            if (Luau::AstLocal* local = node.getLocal())
                if (Luau::ScopePtr scope = Luau::findScopeAtPosition(*module, position))
                    ty = scope->lookup(Luau::Symbol(local));
        }
        if (!ty)
            return "";
        Luau::ToStringOptions options;
        options.maxTableLength = 30;
        options.maxTypeLength = 300;
        options.functionTypeArguments = true;
        return Luau::toString(*ty, options);
    }

    // Every identifier's type, after `check`: a JSON array of {line, column, endLine, endColumn, kind, name, type}
    // (1-based, end exclusive, like the diagnostics). `kind` is local, global, property or type.
    std::string hovers(const std::string& name)
    {
        Luau::ModulePtr module = frontend->moduleResolver.getModule(name);
        const Luau::SourceModule* source = frontend->getSourceModule(name);
        if (!module || !source || !source->root)
            return "[]";
        HoverCollector collector(*module, frontend->builtinTypes);
        source->root->visit(&collector);
        return collector.out + "]";
    }

    // Completions at a 0-based position: a JSON array of {label, kind, type?, deprecated}.
    std::string autocomplete(const std::string& name, unsigned line, unsigned column)
    {
        freeze();
        std::string out = "[";
        try
        {
            Luau::AutocompleteResult result = Luau::autocomplete(
                *frontend,
                name,
                Luau::Position{line, column},
                [](const std::string&, std::optional<const Luau::ExternType*>, std::optional<std::string>) -> std::optional<Luau::AutocompleteEntryMap>
                {
                    return std::nullopt;
                }
            );
            Luau::ToStringOptions options;
            options.maxTableLength = 10;
            options.maxTypeLength = 120;
            options.functionTypeArguments = true;
            for (const auto& [label, entry] : result.entryMap)
            {
                if (out.size() > 1)
                    out += ',';
                out += "{\"label\":";
                appendJsonString(out, label);
                out += ",\"kind\":";
                appendJsonString(out, entryKindName(entry.kind));
                if (entry.type)
                {
                    out += ",\"type\":";
                    appendJsonString(out, Luau::toString(*entry.type, options));
                }
                out += entry.deprecated ? ",\"deprecated\":true}" : ",\"deprecated\":false}";
            }
        }
        catch (const Luau::InternalCompilerError&)
        {
            return "[]";
        }
        return out + "]";
    }

private:
    static const char* entryKindName(Luau::AutocompleteEntryKind kind)
    {
        switch (kind)
        {
        case Luau::AutocompleteEntryKind::Property:
            return "property";
        case Luau::AutocompleteEntryKind::Binding:
            return "binding";
        case Luau::AutocompleteEntryKind::Keyword:
            return "keyword";
        case Luau::AutocompleteEntryKind::String:
            return "string";
        case Luau::AutocompleteEntryKind::Type:
            return "type";
        default:
            return "other";
        }
    }

    void freeze()
    {
        if (!frozen)
        {
            Luau::freeze(frontend->globals.globalTypes);
            frozen = true;
        }
    }

    MemoryResolver resolver;
    std::unique_ptr<Luau::Frontend> frontend;
    bool frozen = false;
};

EMSCRIPTEN_BINDINGS(luau_checker)
{
    emscripten::class_<Checker>("Checker")
        .constructor<>()
        .function("addDefinitions", &Checker::addDefinitions)
        .function("disableGlobal", &Checker::disableGlobal)
        .function("setSource", &Checker::setSource)
        .function("removeSource", &Checker::removeSource)
        .function("setAlias", &Checker::setAlias)
        .function("check", &Checker::check)
        .function("setStrict", &Checker::setStrict)
        .function("typeAt", &Checker::typeAt)
        .function("hovers", &Checker::hovers)
        .function("autocomplete", &Checker::autocomplete);
}
