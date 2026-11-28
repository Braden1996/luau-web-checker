// The playground's starting snippets. The first is shown when the URL carries no code.

import type { Definitions } from "./protocol.ts";

export interface Example {
  readonly id: string;
  readonly label: string;
  readonly definitions: Definitions;
  readonly code: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: "welcome",
    label: "Welcome",
    definitions: "none",
    code: `-- Luau's own type checker, running in your browser (new solver, strict mode).
-- Hover a name to see its type; Ctrl+Space completes; errors are underlined as you type.

type Shape = { kind: "circle", radius: number } | { kind: "square", side: number }

local function area(shape: Shape): number
	if shape.kind == "circle" then
		return math.pi * shape.radius ^ 2
	end
	return shape.side * shape.side
end

local total = area({ kind = "circle", radius = 2 }) + area({ kind = "square", side = 3 })
print(string.format("%.2f", total))

-- Try it: change "square" to "triangle", or call area with no arguments.
`,
  },
  {
    id: "generics",
    label: "Generics",
    definitions: "none",
    code: `local function map<T, U>(items: { T }, transform: (T) -> U): { U }
	local result = {}
	for index, item in items do
		result[index] = transform(item)
	end
	return result
end

local lengths = map({ "a", "bb", "ccc" }, function(word: string): number
	return #word
end)
local labels = map(lengths, tostring)
`,
  },
  {
    id: "classes",
    label: "Classes",
    definitions: "none",
    code: `local Counter = {}
Counter.__index = Counter

function Counter.new(start: number)
	return setmetatable({ count = start }, Counter)
end

export type Counter = typeof(Counter.new(0))

function Counter.increment(self: Counter, by: number?)
	self.count += by or 1
end

local clicks = Counter.new(10)
clicks:increment(5)
print(clicks.count)
`,
  },
  {
    id: "type-functions",
    label: "Type functions",
    definitions: "none",
    code: `type Settings = { volume: number, muted: boolean, language: string }

type SettingName = keyof<Settings>
type Volume = index<Settings, "volume">

local name: SettingName = "muted"
local level: Volume = 0.8
local wrong: SettingName = "brightness"
`,
  },
  {
    id: "example-api",
    label: "Example API",
    definitions: "example",
    code: `-- Checked against the site's example API (see Examples > Definitions files).

local save = createElement("Button", "save")
save:SetLabel("Save")
save:On("click", function(self: Element)
	self:Hide()
end)

local onLogin: Handler<"login"> = function(userName: string, remember: boolean)
	print(userName, remember)
end
subscribe("login")

local user = Users.find(7)
if user then
	print(user.email or user.name)
end
`,
  },
];
