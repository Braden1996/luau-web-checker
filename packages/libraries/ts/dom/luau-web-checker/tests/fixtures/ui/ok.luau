--!strict
-- Correct use of every shape in api.d.luau: no diagnostics.

local button = createElement("Button", "save")
button:SetLabel("Save")
button:SetWidth(button:GetWidth() + 10)
button:On("click", function(self: Element)
	self:Show()
end)

local panel = createElement("Element")
local shown: boolean = panel:IsShown()

local onResize: Handler<"resize"> = function(width: number, height: number)
	local _ = width + height
end
subscribe("resize")

local user = Users.find(42)
if user then
	local label: string = user.name .. " <" .. tostring(user.email or "none") .. ">"
	local _ = label
end

local _ = shown
local _ = onResize
