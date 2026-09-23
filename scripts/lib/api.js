import { Socket } from "./socket";

export class APIQueue {
    constructor() {
        this.queue = [];
        this._resolving = null;
    }
    queueResponse(data) {
        let resolve;
        const promise = new Promise((r) => {
            resolve = r;
        });
        this.queue.push({ data, resolve, promise });
        this.processQueue();
        return promise;
    }

    processQueue() {
        if (!this.queue.length) return;
        if (this._resolving) return;
        const next = this.queue.shift();
        if (!next) return;
        this._resolving = next;
        const { data, resolve } = next;
        Socket.dispatchEpicRoll(data).then((res) => {
            resolve(res[0].response);
            this._resolving = null;
            this.processQueue();
        });
    }
}
