-- A small widget API in the style of a game client: extern types with inheritance, a closed union of names,
-- `keyof`/`index` type functions and `Base & {}` structures (all of which need the new solver).

export type ScriptType = "OnShow" | "OnHide" | "OnClick"

declare extern type Region with
	function GetWidth(self): number
	function SetWidth(self, width: number): ()
end

declare extern type Frame extends Region with
	function Show(self): ()
	function IsShown(self): boolean
	function SetScript(self, scriptType: ScriptType, handler: ((self: Frame, ...any) -> ())?): ()
end

declare extern type Button extends Frame with
	function SetText(self, text: string?): ()
	function GetText(self): string?
end

export type FrameTypeMap = {
	Frame: Frame,
	Button: Button,
}

declare function CreateFrame<K>(frameType: K & keyof<FrameTypeMap>, name: string?): index<FrameTypeMap, K>

export type EventPayloads = {
	PLAYER_LOGIN: () -> (),
	PLAYER_LEVEL_UP: (level: number, healthDelta: number) -> (),
	ADDON_LOADED: (addOnName: string, containsBindings: boolean) -> (),
}
export type EventHandler<E> = index<EventPayloads, E>

declare function RegisterEvent(event: keyof<EventPayloads>): ()

export type ItemBase = { itemID: number, name: string }
export type ItemInfo = ItemBase & { quality: number, stackCount: number? }

declare C_Item: {
	GetItemInfo: (itemID: number) -> ItemInfo?,
	GetItemCount: (itemID: number, includeBank: boolean?) -> number,
}
