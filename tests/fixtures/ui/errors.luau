--!strict
-- Misuse of api.d.luau: each `expect-error` line must get a diagnostic, in luau-lsp and in the WebAssembly build alike.

local button = createElement("Buton") -- expect-error: unknown element kind
local panel = createElement("Element")
panel:SetLabel("x") -- expect-error: Element has no SetLabel
panel:On("clik", nil) -- expect-error: unknown event name
panel:SetWidth("wide") -- expect-error: string is not a number

local onLogin: Handler<"login"> = function(userName: number) -- expect-error: wrong parameter type
	local _ = userName
end
subscribe("redy") -- expect-error: unknown message

local user = Users.find(42)
local age: number = user.age -- expect-error: user may be nil
local count: string = Users.count() -- expect-error: number is not a string

local _ = button
local _ = onLogin
local _ = age
local _ = count
