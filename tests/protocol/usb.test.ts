import { describe, expect, it } from 'vitest';
import {
    PybricksUsbInEndpointMessageType,
    PybricksUsbInterfaceRequest,
    decodeUsbInMessage,
    encodeUsbCommand,
    encodeUsbSubscribe,
    gattReadSetup,
    pybricksReadSetup,
    uuid16,
} from '../../src/protocol/usb.js';

describe('framing USB Pybricks', () => {
    it('extrae el alias de 16 bits', () => {
        expect(uuid16('c5f50003-8280-46da-89f4-6d8051e4aeef')).toBe(0x0003);
        expect(() => uuid16('no-es-un-uuid')).toThrow();
    });

    it('codifica comandos y suscripción', () => {
        expect(encodeUsbCommand(new Uint8Array([0x00]))).toEqual(
            new Uint8Array([0x02, 0x00]),
        );
        expect(encodeUsbSubscribe(true)).toEqual(new Uint8Array([0x01, 0x01]));
        expect(encodeUsbSubscribe(false)).toEqual(new Uint8Array([0x01, 0x00]));
    });

    it('decodifica respuestas con status u32', () => {
        expect(
            decodeUsbInMessage(
                new Uint8Array([
                    PybricksUsbInEndpointMessageType.Response,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                ]),
            ),
        ).toEqual({ type: 'response', statusCode: 0 });

        expect(
            decodeUsbInMessage(
                new Uint8Array([PybricksUsbInEndpointMessageType.Response, 0x05, 0, 0, 0]),
            ),
        ).toEqual({ type: 'response', statusCode: 5 });
    });

    it('decodifica eventos y mensajes desconocidos', () => {
        expect(
            decodeUsbInMessage(
                new Uint8Array([PybricksUsbInEndpointMessageType.Event, 0x00, 0x40]),
            ),
        ).toEqual({ type: 'event', data: new Uint8Array([0x00, 0x40]) });

        expect(decodeUsbInMessage(new Uint8Array([0x7f]))).toMatchObject({
            type: 'unknown',
        });
        expect(decodeUsbInMessage(new Uint8Array())).toMatchObject({
            type: 'unknown',
        });
    });

    it('rechaza respuestas truncadas', () => {
        expect(() =>
            decodeUsbInMessage(new Uint8Array([PybricksUsbInEndpointMessageType.Response, 0])),
        ).toThrow();
    });

    it('construye transferencias de control', () => {
        expect(gattReadSetup(0x2a26)).toEqual({
            requestType: 'class',
            recipient: 'interface',
            request: PybricksUsbInterfaceRequest.Gatt,
            value: 0x2a26,
            index: 0,
        });
        expect(pybricksReadSetup(3)).toEqual({
            requestType: 'class',
            recipient: 'interface',
            request: PybricksUsbInterfaceRequest.Pybricks,
            value: 3,
            index: 0,
        });
    });
});
