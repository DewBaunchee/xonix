import {Component, ElementRef, ViewChild} from "@angular/core";
import {XonixGame, XonixLevel} from "./xonix/xonix";
import {Observable, switchMap} from "rxjs";
import {HttpClient} from "@angular/common/http";
import {fromPromise} from "rxjs/internal/observable/innerFrom";

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.css"]
})
export class AppComponent {

    public readonly game: XonixGame = new XonixGame();

    constructor(private readonly http: HttpClient) {
    }

    @ViewChild("canvas")
    public set canvas(ref: ElementRef) {
        if (!ref.nativeElement) return;

        const canvas: HTMLCanvasElement = ref.nativeElement;
        this.game.ctx = canvas.getContext("2d") || undefined;

        this.loadAsset("assets/img.png").subscribe(image => {
            const level = XonixLevel.builder()
                .apply(b => {
                    b.background = image;
                    b.resize(100, 50);
                    b.claimBorder(3);
                    b.setDefaultPlayerPosition(50, 0);
                    b.addEnemy(10, 10);
                    b.addEnemy(50, 23);
                    b.addEnemy(0, 1);
                    b.addDestroyer(40, 10);
                })
                .build();

            level.countdownTime = 120;

            level.onWin().subscribe(() => alert("win"));
            level.onDie().subscribe(() => alert("died"));
            level.onLose().subscribe(() => alert("lose"));

            this.game.start(level);
        });
    }

    private loadAsset(path: string): Observable<ImageBitmap> {
        return this.http.get(
            path,
            {responseType: "blob"}
        ).pipe(switchMap(res => {
            return fromPromise(createImageBitmap(res));
        }));
    }
}
