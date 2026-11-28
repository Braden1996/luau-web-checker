--!strict
-- Required by ../main.luau; requires its sibling folder through a relative path.

local consts = require("../shared/consts")

local util = {}

function util.add(a: number, b: number): number
	return a + b
end

function util.describe(value: number): string
	return consts.prefix .. tostring(value)
end

return util
