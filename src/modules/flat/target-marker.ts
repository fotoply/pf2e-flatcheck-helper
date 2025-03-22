import { OutlineFilter } from "@pixi/filter-outline"
import { BaseModule } from "../base"
import { LightLevels, TargetColors } from "./light/utils"
import type { TokenPF2e } from "foundry-pf2e"
import { calculateFlatCheck, guessOrigin } from "./target"

const tokenTargetManager = {
	tokenMap: new Map<string, TokenTargetRenderer>(),
	getOrCreate(token: TokenPF2e) {
		if (this.tokenMap.has(token.id)) return this.tokenMap.get(token.id)!
		const r = new TokenTargetRenderer(token)
		this.tokenMap.set(token.id, r)
		return r
	},
	target(token: TokenPF2e) {
		this.getOrCreate(token).draw()
	},
	untarget(token: TokenPF2e) {
		this.tokenMap.get(token.id)?.destroy()
		this.tokenMap.delete(token.id)
	},
	refreshToken(token: TokenPF2e) {
		this.tokenMap.get(token.id)?.draw()
	},
	destroyAll() {
		for (const [_, token] of this.tokenMap.entries()) token.destroy()
	},
	refreshTargets() {
		for (const t of game.user.targets) this.target(t)
	},
}

const style: Partial<PIXI.ITextStyle> = { align: "center", dropShadow: false, strokeThickness: 2 }
const textStyles = {
	normal: (scale: number) => PreciseText.getTextStyle({ fontSize: 14 * scale, ...style }),
	small: (scale: number) =>
		PreciseText.getTextStyle({ fontSize: 12 * scale, fill: "#eeeeee", ...style }),
}

class TokenTargetRenderer {
	#layer: PIXI.Container
	#filter: OutlineFilter
	constructor(public token: TokenPF2e) {
		this.#layer = new PIXI.Container()
		this.#layer.alpha = 0.9
		this.#filter = new OutlineFilter(undefined, undefined, 1, 1, false)

		this.token.addChild(this.#layer)
		this.token.mesh?.filters?.push(this.#filter)
	}

	draw() {
		this.#layer.removeChildren()
		const condition = calculateFlatCheck(guessOrigin(), this.token)

		if (!condition) {
			this.#filter.enabled = false
			return
		}

		const color = TargetColors.fromDC(condition.dc)
		this.#filter.color = color.toNumber()

		const gridSize = this.token.scene!.grid.size

		const baseThickness = 6
		const squares = Math.max(
			1,
			Math.ceil(Math.min(this.token.bounds.width, this.token.bounds.height) / gridSize),
		)
		const thickness = baseThickness + squares * 3
		this.#filter.thickness = thickness
		this.#filter.enabled = true

		const textScale = Math.max(gridSize / 100, 0.8) + 0.5 * (squares - 1)
		const text = new PreciseText(
			`DC ${condition.dc} - ${condition.label}`,
			textStyles.normal(textScale),
		)
		text.x = this.token.bounds.width / 2 - text.width / 2
		text.y = this.token.bounds.height * 0.95 - text.height
		this.#layer.addChild(text)
		if ("description" in condition && condition.description) {
			const smallText = new PreciseText(condition.description, textStyles.small(textScale))
			smallText.x = this.token.bounds.width / 2 - smallText.width / 2
			smallText.y = text.y - smallText.height * 0.75
			this.#layer.addChild(smallText)
		}
	}
	destroy() {
		this.#layer.destroy()

		const idx = this.token.mesh?.filters?.indexOf(this.#filter)
		if (idx !== undefined && idx > -1) this.token.mesh?.filters?.splice(idx, 1)
	}
}

export class TargetInfoModule extends BaseModule {
	settingsKey = "flat-check-targer-marker"

	enable(): void {
		this.registerHook("targetToken", (user, token: TokenPF2e, state, boolean) => {
			if (state) tokenTargetManager.target(token)
			else tokenTargetManager.untarget(token)
		})
		this.registerHook("controlToken", () => {
			tokenTargetManager.refreshTargets()
		})
		const refreshTimeoutIds = new Map<string, NodeJS.Timeout>()
		this.registerHook("refreshToken", (token: TokenPF2e, args: Record<string, boolean>) => {
			if (!(args.refreshPosition && args.refreshVisibility)) return

			if (refreshTimeoutIds.has(token.id)) {
				clearTimeout(refreshTimeoutIds.get(token.id))
			}
			const id = setTimeout(() => {
				refreshTimeoutIds.delete(token.id)
				tokenTargetManager.refreshToken(token)
			}, 100)
			refreshTimeoutIds.set(token.id, id)
		})
		this.registerHook("canvasTearDown", () => {
			tokenTargetManager.destroyAll()
		})
		this.registerHook("lightingRefresh", () => {
			tokenTargetManager.refreshTargets()
		})
	}

	disable() {
		super.disable()
		tokenTargetManager.destroyAll()
	}
}
