import {Subject} from "rxjs";
import {formatDate} from "@angular/common";

declare type Timeout = NodeJS.Timeout;
declare type Interval = NodeJS.Timeout;
declare type Ctx = CanvasRenderingContext2D;

export class XonixGame {

    public level = XonixLevel.empty();

    public ctx?: Ctx;

    public updateInterval: number = 0;
    private lastUpdate: number = 0;
    private nextUpdate?: Timeout;
    private paused = false;

    constructor() {
        this.setUpdateIntervalFromFPS(30);
    }

    public setUpdateIntervalFromFPS(fps: number) {
        this.updateInterval = 1000 / fps;
    }

    public isRunning() {
        return !!this.nextUpdate;
    }

    public isPaused() {
        return this.paused;
    }

    public isStopped() {
        return !this.isRunning() && !this.isPaused();
    }

    public start(level: XonixLevel) {
        if (!this.isStopped()) {
            this.stop();
        }

        this.level = level;
        this.setup();

        this.level.timer.start(!!level.countdownTime, level.countdownTime);

        this.run();
    }

    private setup() {
        const ctx = this.ctx;
        if (!ctx) throw new Error("No canvas");

        this.setupListeners(ctx)
    }

    private setupListeners(ctx: Ctx) {
        const document = ctx.canvas.ownerDocument;

        const createArrowListener = (xDirection: number, yDirection: number) => {
            return () => {
                this.level.player.direction.set(xDirection, yDirection);
                this.level.player.speed = 1;
            };
        };

        const listeners: { [key: string]: () => void } = {
            "ArrowLeft": createArrowListener(-1, 0),
            "ArrowRight": createArrowListener(1, 0),
            "ArrowUp": createArrowListener(0, -1),
            "ArrowDown": createArrowListener(0, 1),
        };
        document.addEventListener("keydown", e => {
            const listener = listeners[e.code];
            if (listener) listener();
        });
    }

    public run() {
        this.paused = false;

        this.lastUpdate = Date.now();

        const tick = () => {
            try {
                this.tick()
            } finally {
                this.nextUpdate = setTimeout(tick, this.updateInterval)
            }
        };
        tick();
    }

    public pause() {
        this.level.timer.pause();
        clearTimeout(this.nextUpdate);
        this.nextUpdate = undefined;
        this.paused = true;
    }

    public stop() {
        this.level.timer.stop();
        clearTimeout(this.nextUpdate);
        this.nextUpdate = undefined;
        this.level = XonixLevel.empty();
    }

    private tick() {
        const now = Date.now();
        const delta = 1;

        if (this.ctx) {
            this.update(delta);
            this.draw(this.ctx);
        }

        this.lastUpdate = now;
    }

    private update(delta: number) {
        this.level.entities.forEach(entity => {
            entity.update(delta, this.level);
        });
    }

    private draw(ctx: Ctx) {
        this.drawBackground(ctx);
        this.drawField(ctx);
    }

    private drawBackground(ctx: Ctx) {
        const {width, height} = ctx.canvas;
        const background = this.level.background;
        if (typeof background === "string") {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, width, height);
        } else {
            ctx.drawImage(background, 0, 0, width, height);
        }
    }

    private drawField(ctx: Ctx) {
        const {width, height} = ctx.canvas;

        const cellWidth = width / this.level.field.width;
        const cellHeight = height / this.level.field.height;

        this.level.field.forEachCell((x, y, state) => {
            ctx.fillStyle = this.level.getColor(state);
            ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
        });

        this.level.entities.forEach(entity => {
            const {xRounded, yRounded} = entity.position;
            ctx.fillStyle = entity.color;
            ctx.fillRect(xRounded * cellWidth, yRounded * cellHeight, cellWidth, cellHeight);
        });

        // TODO Image Data caching
    }
}

class XY {
    public x = 0;
    public y = 0;

    public set(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public setFrom(xy: XY) {
        this.x = xy.x;
        this.y = xy.y;
    }

    public differRounded(x: number, y: number) {
        return x !== this.xRounded || y !== this.yRounded;
    }

    public get xRounded() {
        return Math.floor(this.x);
    }

    public get yRounded() {
        return Math.floor(this.y);
    }
}

interface Collision {
    x: number;
    y: number;
    currentCellState: CellState;
    collidedCellState?: CellState;
    collidedEntity?: Entity;
}

abstract class Entity {
    public position = new XY();
    public direction = new XY();
    public speed = 0;
    public color = "#000";

    public update(delta: number, level: XonixLevel) {
        const deltaSpeed = this.speed * delta;

        const currX = this.position.x;
        const currY = this.position.y

        const nextX = currX + this.direction.x * deltaSpeed;
        const nextY = currY + this.direction.y * deltaSpeed;

        const collision =
            this.checkCollision(
                level,
                Math.floor(currX), Math.floor(currY),
                Math.floor(nextX), Math.floor(nextY)
            );

        if (collision) {
            this.onCollision(level, collision);
        } else {
            this.position.x = nextX;
            this.position.y = nextY;
        }
    }

    private checkCollision(
        level: XonixLevel,
        currX: number, currY: number,
        nextX: number, nextY: number
    ): Collision | undefined {
        const field = level.field;
        const currCell = field.getCell(currX, currY);

        return this.checkCollisions(
            (x, y) => field.getCell(x, y),
            item => currCell !== item,
            item => ({collidedCellState: item}),
            currCell,
            currX, currY,
            nextX, nextY
        ) || this.checkCollisions(
            (x, y) => level.entities.find(entity => !entity.position.differRounded(x, y)),
            item => !!item && item !== this,
            item => ({collidedEntity: item}),
            currCell,
            currX, currY,
            nextX, nextY
        );
    }

    private checkCollisions<T>(
        provider: (x: number, y: number) => T,
        predicate: (item: T) => boolean,
        collisionFactory: (item: T) => Partial<Collision>,
        currentCellState: CellState,
        currX: number, currY: number,
        nextX: number, nextY: number,
    ): Collision | undefined {
        return this.checkCollisionForPosition(
            provider, predicate, collisionFactory, currentCellState,
            nextX, currY
        ) || this.checkCollisionForPosition(
            provider, predicate, collisionFactory, currentCellState,
            currX, nextY
        ) || this.checkCollisionForPosition(
            provider, predicate, collisionFactory, currentCellState,
            nextX, nextY
        );
    }

    private checkCollisionForPosition<T>(
        provider: (x: number, y: number) => T,
        predicate: (item: T) => boolean,
        collisionFactory: (item: T) => Partial<Collision>,
        currentCellState: CellState,
        x: number, y: number,
    ): Collision | undefined {
        const nextCell = provider(x, y);
        if (predicate(nextCell)) return {
            x: x, y: y,
            currentCellState,
            ...collisionFactory(nextCell)
        };

        return undefined;
    }

    protected abstract onCollision(level: XonixLevel, collision: Collision): void;
}

class Player extends Entity {

    public lives = 0;
    public claiming = false;

    public override update(delta: number, level: XonixLevel) {
        const prevX = this.position.xRounded;
        const prevY = this.position.yRounded;
        super.update(delta, level);
        if (
            this.claiming
            && this.position.differRounded(prevX, prevY)
            && level.field.getCell(prevX, prevY) !== CellState.CLAIMED
        ) {
            level.field.setCellByXY(CellState.CLAIMING, prevX, prevY);
        }
    }

    protected onCollision(level: XonixLevel, collision: Collision): void {
        const {x, y} = collision;
        const collidedState = collision.collidedCellState;
        if (collidedState === CellState.OUT_OF_BOUNDS) {
            this.speed = 0;
            return;
        }
        if (collidedState === CellState.UNCLAIMED) {
            this.position.set(x, y);
            this.claiming = true;
            return;
        }
        if (collidedState === CellState.CLAIMED) {
            level.field.setCellByXY(CellState.CLAIMING, this.position.xRounded, this.position.yRounded);
            this.position.set(x, y);
            level.claim();
            this.claiming = false;
            return;
        }
        if (collidedState === CellState.CLAIMING) {
            this.claiming = false;
            level.die();
            return;
        }
    }
}

class Enemy extends Entity {

    protected onCollision(level: XonixLevel, collision: Collision): void {
        const {x, y} = collision;
        const collidedState = collision.collidedCellState;
        const collidedEntity = collision.collidedEntity;

        const playerCollided = collidedEntity instanceof Player;

        const notVerticalCollide = x !== this.position.xRounded;
        const notHorizontalCollide = y !== this.position.yRounded;
        if (notVerticalCollide) {
            this.direction.x *= -1;
        }
        if (notHorizontalCollide) {
            this.direction.y *= -1;
        }

        if (collidedState === CellState.CLAIMING || playerCollided) {
            level.die();
        }
    }
}

class Destroyer extends Enemy {

    protected override onCollision(level: XonixLevel, collision: Collision) {
        super.onCollision(level, collision);
        const {x, y, collidedCellState} = collision;
        if (collidedCellState === CellState.CLAIMED) {
            level.field.setCellByXY(CellState.UNCLAIMED, x, y);
        }
    }
}

class XonixField {

    private readonly cells: CellState[] = [];
    private readonly couldClaim: boolean[] = [];
    private readonly cellCount: number[] = new Array(Object.values(CellState).length / 2).fill(0);

    constructor(
        public readonly width: number,
        public readonly height: number
    ) {
        this.cells = new Array(this.width * this.height);
        this.couldClaim = new Array(this.width * this.height);
        for (let i = 0; i < this.cells.length; i++) {
            this.setCellDirect(CellState.UNCLAIMED, i);
        }
    }

    public setCellByXY(value: CellState, x: number, y: number) {
        this.setCellDirect(value, this.efficientIndex(x, y));
    }

    public setCellDirect(value: CellState, i: number) {
        const prevState = this.cells[i];
        this.cellCount[prevState]--;
        this.cellCount[value]++;
        this.cells[i] = value;
    }

    public getCell(x: number, y: number) {
        if (this.isOut(x, y)) return CellState.OUT_OF_BOUNDS;
        return this.cells[this.efficientIndex(x, y)];
    }

    private isOut(x: number, y: number) {
        return x < 0 || x >= this.width
            || y < 0 || y >= this.height;
    }

    public forEachCell(cellIterator: (x: number, y: number, state: CellState) => void) {
        for (let i = 0; i < this.cells.length; i++) {
            const y = Math.floor(i / this.width);
            const x = i % this.width;
            const state = this.cells[i];

            cellIterator(x, y, state);
        }
    }

    private efficientIndex(x: number, y: number) {
        return y * this.width + x;
    }

    public claim(enemies: Enemy[]) {
        // Claiming player trail first...
        for (let i = 0; i < this.cells.length; i++) {
            if (this.cells[i] === CellState.CLAIMING) {
                this.setCellDirect(CellState.CLAIMED, i);
            }
        }

        // Searching cells that we cannot claim with span filling algorithm, where enemies are seeds...
        for (let i = 0; i < this.couldClaim.length; i++) {
            this.couldClaim[i] = true;
        }
        const shouldStopScan = (index: number) =>
            this.cells[index] === CellState.CLAIMED || !this.couldClaim[index];
        const startScan = (startX: number, startY: number) => {
            const stack: number[] = [this.efficientIndex(startX, startY)];
            while (stack.length) {
                const cellIndex = stack.pop()!;
                if (shouldStopScan(cellIndex)) continue;

                const y = Math.floor(cellIndex / this.width);
                const rowStart = this.efficientIndex(0, y);
                const rowEnd = this.efficientIndex(this.width - 1, y);

                let lx = cellIndex;
                let rx = cellIndex + 1;
                for (; lx >= rowStart; lx--) {
                    if (shouldStopScan(lx)) break;
                    this.couldClaim[lx] = false;
                }
                for (; rx <= rowEnd; rx++) {
                    if (shouldStopScan(rx)) break;
                    this.couldClaim[rx] = false;
                }

                const w = this.width;
                for (let i = lx + 1; i < rx; i++) {
                    const aboveIndex = i - w;
                    if (!shouldStopScan(aboveIndex))
                        stack.push(aboveIndex);

                    const belowIndex = i + w;
                    if (!shouldStopScan(belowIndex))
                        stack.push(belowIndex);
                }
            }
        };
        for (const enemy of enemies) {
            const {x, y} = enemy.position;
            startScan(x, y);
        }

        // Claiming all that we could claim
        for (let i = 0; i < this.couldClaim.length; i++) {
            if (this.couldClaim[i]) {
                this.setCellDirect(CellState.CLAIMED, i);
            }
        }
    }

    public clearClaiming() {
        for (let i = 0; i < this.cells.length; i++) {
            if (this.cells[i] === CellState.CLAIMING) {
                this.setCellDirect(CellState.UNCLAIMED, i);
            }
        }
    }

    public claimedRatio() {
        return this.cellCount[CellState.CLAIMED] / this.cells.length;
    }
}

enum CellState {
    OUT_OF_BOUNDS,
    UNCLAIMED,
    CLAIMED,
    CLAIMING
}

// LEVELS

export class XonixLevel {

    public background: string | ImageBitmap = "#FFF";

    public unclaimedColor = "#000";
    public claimedColor = "#00000000";
    public claimingColor = "#0F0";

    public claimRatioWin = 0.8;

    public defaultPlayerPosition = new XY();

    private readonly _win = new Subject();
    private readonly _die = new Subject();
    private readonly _lose = new Subject();

    public countdownTime?: number;
    public readonly timer: XonixTimer = new XonixTimer();

    constructor(
        public readonly field: XonixField,
        public readonly enemies: Enemy[],
        public readonly player: Player
    ) {
        this.enemies.forEach(e => {
            if (e instanceof Destroyer) {
                e.color = "purple";
            } else {
                e.color = "red";
            }
        });
        this.player.color = "blue";
        this.timer.onTimeUp().subscribe(() => this.lose())
    }

    public static builder() {
        return new XonixLevelBuilder();
    }

    public static empty(fieldWidth = 0, fieldHeight = 0): XonixLevel {
        return new XonixLevel(
            new XonixField(fieldWidth, fieldHeight),
            [],
            new Player()
        )
    }

    public get entities(): Entity[] {
        return [this.player, ...this.enemies];
    }

    private win() {
        this._win.next(void 0);
    }

    public die() {
        this.player.lives--;
        this._die.next(void 0);
        this.player.speed = 0;
        this.player.position.setFrom(this.defaultPlayerPosition);
        this.field.clearClaiming();
        if (this.player.lives < 0) {
            this.lose();
        }
    }

    private lose() {
        this._lose.next(void 0);
    }

    public onWin() {
        return this._win.asObservable();
    }

    public onDie() {
        return this._die.asObservable();
    }

    public onLose() {
        return this._lose.asObservable();
    }

    public getColor(cellState: CellState) {
        if (cellState === CellState.UNCLAIMED) return this.unclaimedColor;
        if (cellState === CellState.CLAIMED) return this.claimedColor;
        if (cellState === CellState.CLAIMING) return this.claimingColor;
        throw new Error("No color for state " + cellState);
    }

    public claim() {
        this.field.claim(this.enemies);
        const claimRatio = this.field.claimedRatio();
        if (claimRatio > this.claimRatioWin) {
            this.win();
        }
    }
}

export class XonixLevelBuilder {

    private field = new XonixField(0, 0);

    public background: string | ImageBitmap = "#FFF";

    public unclaimedColor = "#000";
    public claimedColor = "#00000000";
    public claimingColor = "#0F0";

    public defaultPlayerPosition = new XY();

    public enemies = [] as Enemy[];
    public player = new Player();

    public apply(builder: (builder: XonixLevelBuilder) => void) {
        builder(this);
        return this;
    }

    public setDefaultPlayerPosition(x: number, y: number) {
        this.defaultPlayerPosition.set(x, y);
    }

    public resize(fieldWidth: number, fieldHeight: number) {
        this.field = new XonixField(fieldWidth, fieldHeight);
    }

    public claimBorder(width: number) {
        const field = this.field;
        for (let x = 0; x < field.width; x++) {
            for (let i = 0; i < width; i++) {
                field.setCellByXY(CellState.CLAIMED, x, i);
                field.setCellByXY(CellState.CLAIMED, x, field.height - i - 1);
            }
        }
        for (let y = 0; y < field.height; y++) {
            for (let i = 0; i < width; i++) {
                field.setCellByXY(CellState.CLAIMED, i, y);
                field.setCellByXY(CellState.CLAIMED, field.width - i - 1, y);
            }
        }
    }

    public addEnemy(x: number, y: number) {
        const enemy = new Enemy();
        enemy.position.set(x, y);
        enemy.direction.set(1, 1);
        enemy.speed = 1;
        this.enemies.push(enemy);
    }

    public addDestroyer(x: number, y: number) {
        const destroyer = new Destroyer();
        destroyer.position.set(x, y);
        destroyer.direction.set(1, 1);
        destroyer.speed = 1;
        this.enemies.push(destroyer);
    }

    public build(): XonixLevel {
        const level = new XonixLevel(this.field, this.enemies, this.player);
        this.player.position.setFrom(this.defaultPlayerPosition);
        level.background = this.background;
        level.unclaimedColor = this.unclaimedColor;
        level.claimedColor = this.claimedColor;
        level.claimingColor = this.claimingColor;
        level.defaultPlayerPosition = this.defaultPlayerPosition;
        return level;
    }
}

class XonixTimer {

    private seconds: number = 0;
    private interval?: Interval;
    private paused = false;

    private readonly _onTimeUp = new Subject<void>();

    public start(countdown = false, startSeconds = 0) {
        if (this.paused) {
            this.resume();
            return;
        }

        this.stop();

        this.seconds = startSeconds;
        const increment: number = countdown ? -1 : 1;
        this.interval = setInterval(() => {
            if (this.paused) return;

            this.seconds += increment;
            if (countdown && this.seconds < 0) {
                this._onTimeUp.next();
                this.pause();
            }
        }, 1000)
    }

    public resume() {
        this.paused = false;
    }

    public pause() {
        this.paused = true;
    }

    public stop() {
        this.seconds = 0;
        clearInterval(this.interval);
    }

    public onTimeUp() {
        return this._onTimeUp.asObservable();
    }

    public toString() {
        return formatDate(
            Math.max(0, this.seconds) * 1000,
            "mm:ss",
            "en"
        );
    }
}
