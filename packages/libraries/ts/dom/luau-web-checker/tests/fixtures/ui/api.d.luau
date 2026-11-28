-- A small UI API: extern types with inheritance, a closed union of names, `keyof`/`index` type functions and
-- `Base & {}` structures (all of which need the new solver).

export type EventName = "click" | "focus" | "blur"

declare extern type Node with
	function GetWidth(self): number
	function SetWidth(self, width: number): ()
end

declare extern type Element extends Node with
	function Show(self): ()
	function IsShown(self): boolean
	function On(self, event: EventName, handler: ((self: Element, ...any) -> ())?): ()
end

declare extern type Button extends Element with
	function SetLabel(self, label: string?): ()
	function GetLabel(self): string?
end

export type ElementTypeMap = {
	Element: Element,
	Button: Button,
}

declare function createElement<K>(kind: K & keyof<ElementTypeMap>, id: string?): index<ElementTypeMap, K>

export type Messages = {
	ready: () -> (),
	resize: (width: number, height: number) -> (),
	login: (userName: string, remember: boolean) -> (),
}
export type Handler<M> = index<Messages, M>

declare function subscribe(message: keyof<Messages>): ()

export type Account = { id: number, name: string }
export type User = Account & { age: number, email: string? }

declare Users: {
	find: (id: number) -> User?,
	count: (includeInactive: boolean?) -> number,
}
