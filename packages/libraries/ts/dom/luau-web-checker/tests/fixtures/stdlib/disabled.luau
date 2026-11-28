--!strict
-- Globals removed by settings.json (luau-lsp's types.disabledGlobals) are unknown; the rest of the library stays.

local t = table.clone({ 1, 2 }) -- expect-error: removed member
local now = os.time() -- expect-error: removed library
local packed = string.pack("i4", 1) -- expect-error: removed member
local copy = table.concat({ "a", "b" }, ",") -- kept
local floor = math.floor(1.5) -- kept

local _ = t
local _ = now
local _ = packed
local _ = copy
local _ = floor
