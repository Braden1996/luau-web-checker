-- No mode comment: nonstrict, luau-lsp's default. Lints still run.
local unused = 1
local function shadow(x)
	local x = x + 1
	return x
end

local t = {}
t.value = "a" + 1
print(shadow(2), undefinedGlobal)
