--!strict
-- Correct use of every shape in api.d.luau: no diagnostics.

local button = CreateFrame("Button", "MyButton")
button:SetText("Click me")
button:SetWidth(button:GetWidth() + 10)
button:SetScript("OnClick", function(self: Frame)
	self:Show()
end)

local frame = CreateFrame("Frame")
local shown: boolean = frame:IsShown()

local onLevel: EventHandler<"PLAYER_LEVEL_UP"> = function(level: number, healthDelta: number)
	local _ = level + healthDelta
end
RegisterEvent("PLAYER_LEVEL_UP")

local info = C_Item.GetItemInfo(6948)
if info then
	local label: string = info.name .. " x" .. tostring(info.stackCount or 1)
	local _ = label
end

local _ = shown
local _ = onLevel
