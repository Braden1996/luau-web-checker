--!strict
-- Misuse of api.d.luau: each `expect-error` line must get a diagnostic, in luau-lsp and in the WebAssembly build alike.

local button = CreateFrame("Buton") -- expect-error: unknown frame type
local frame = CreateFrame("Frame")
frame:SetText("x") -- expect-error: Frame has no SetText
frame:SetScript("OnClik", nil) -- expect-error: unknown script type
frame:SetWidth("wide") -- expect-error: string is not a number

local onLoaded: EventHandler<"ADDON_LOADED"> = function(addOnName: number) -- expect-error: wrong parameter type
	local _ = addOnName
end
RegisterEvent("PLAYER_LOGN") -- expect-error: unknown event

local info = C_Item.GetItemInfo(6948)
local quality: number = info.quality -- expect-error: info may be nil
local count: string = C_Item.GetItemCount(6948) -- expect-error: number is not a string

local _ = button
local _ = onLoaded
local _ = quality
local _ = count
