import {XonixGame, XonixLevel} from "./xonix";

const game = new XonixGame();

const lives: HTMLSpanElement | null = document.querySelector("#lives");
const claimedRatio: HTMLSpanElement | null = document.querySelector("#claimed-ratio");
const timer: HTMLSpanElement | null = document.querySelector("#timer");
const canvas: HTMLCanvasElement | null = document.querySelector("canvas");
if (!lives || !claimedRatio || !timer || !canvas) {
    alert("No one of the elements");
    throw new Error();
}

game.ctx = canvas.getContext("2d") || undefined;
game.onUpdate(() => {
    lives.innerHTML = game.level.player.lives + "";
    claimedRatio.innerHTML = `${(game.level.field.claimedRatio() * 100).toFixed(2)}%`;
    timer.innerHTML = game.level.timer.toString();
});
game.start(
    XonixLevel.builder()
        .apply(b => {
            b.resize(100, 50);
            b.claimBorder(3);
            b.setDefaultPlayerPosition(50, 0);
            b.addEnemy(10, 10);
            b.addEnemy(50, 23);
            b.addEnemy(0, 1);
            b.addDestroyer(40, 10);
        })
        .build()
        .also(level => {
            level.countdownTime = 120;

            level.onWin(() => alert("win"));
            level.onDie(() => alert("died"));
            level.onLose(() => alert("lose"));
        })
);