--!strict
-- Modules found by relative paths and by a .luaurc alias.

local util = require("./lib/util")
local consts = require("@shared/consts")

local total: number = util.add(consts.base, 2)
local label: string = util.describe(total)
local wrong: string = util.add(1, 2) -- expect-error: add returns a number

local _ = label
local _ = wrong
