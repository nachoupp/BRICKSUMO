import { TimeoutError, TransportError } from '../protocol/errors.js';

interface Waiter<T> {
    readonly predicate: (value: T) => boolean;
    readonly resolve: (value: T) => void;
    readonly reject: (error: Error) => void;
    readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Cola de notificaciones con esperas por predicado.
 *
 * Es la pieza que evita la carrera clásica "la respuesta llega antes de que
 * empecemos a esperarla": los mensajes se encolan y `waitFor` los consume.
 */
export class NotificationQueue<T> {
    private readonly queue: T[] = [];
    private readonly waiters: Waiter<T>[] = [];
    private closed = false;

    /** Encola o entrega un mensaje al primer waiter compatible. */
    push(value: T): void {
        if (this.closed) {
            return;
        }

        for (let index = 0; index < this.waiters.length; index++) {
            const waiter = this.waiters[index];
            if (waiter !== undefined && waiter.predicate(value)) {
                this.waiters.splice(index, 1);
                clearTimeout(waiter.timer);
                waiter.resolve(value);
                return;
            }
        }

        this.queue.push(value);
    }

    /** Espera un mensaje que cumpla el predicado. */
    waitFor(predicate: (value: T) => boolean, timeoutMs: number): Promise<T> {
        if (this.closed) {
            return Promise.reject(new TransportError('la cola de mensajes está cerrada'));
        }

        for (let index = 0; index < this.queue.length; index++) {
            const value = this.queue[index];
            if (value !== undefined && predicate(value)) {
                this.queue.splice(index, 1);
                return Promise.resolve(value);
            }
        }

        return new Promise<T>((resolve, reject) => {
            const waiter: Waiter<T> = {
                predicate,
                resolve,
                reject,
                timer: setTimeout(() => {
                    const index = this.waiters.indexOf(waiter);
                    if (index >= 0) {
                        this.waiters.splice(index, 1);
                    }
                    reject(
                        new TimeoutError(
                            `timeout esperando mensaje del hub (${timeoutMs} ms)`,
                        ),
                    );
                }, timeoutMs),
            };

            this.waiters.push(waiter);
        });
    }

    /** Cierra la cola y rechaza a todos los que estén esperando. */
    close(reason = new TransportError('la conexión se cerró')): void {
        this.closed = true;
        this.queue.length = 0;
        for (const waiter of this.waiters.splice(0)) {
            clearTimeout(waiter.timer);
            waiter.reject(reason);
        }
    }

    /** Descarta mensajes pendientes sin cerrar la cola. */
    clear(): void {
        this.queue.length = 0;
    }
}
