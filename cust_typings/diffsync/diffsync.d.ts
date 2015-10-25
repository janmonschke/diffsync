/// <reference path='../../typings/node/node.d.ts' />

declare var diffsync: diffsync.diffsync;

declare module diffsync {
    export interface diffsync {
        new (): diffsync;
        Client: IClient;
        Server: IServer;
        COMMANDS: ICOMMANDS;
        InMemoryDataAdapter: IInMemoryDataAdapter;
    }

    export interface IClient extends NodeJS.EventEmitter {
        new (socket: any, room: string, diffOptions: {});
        socket: any;
        room: string;
        syncing: boolean;
        initialized: boolean;
        scheduled: boolean;
        doc: IDoc;

        jsondiffpatch: any;
        getData(): {};
        initialize(): void;
        _onConnected(initialVersion: {}): void;
        onRemoteUpdate(fromId: string): void;
        schedule(): void;
        sync(): void;
        syncWithServer(): void;
        createDiff(docA: IDoc, docB: IDoc): IDiff;
        applyPatchTo(obj: {}, patch: IDiff): void;
        createDiffMessage(diff: IDiff, baseVersion: number): {
            serverVersion: number,
            localVersion: number,
            diff: IDiff
        };
        createEditMessage(baseVersion: number): {
            room: any,
            edits: any[],
            localVersion: number,
            serverVersion: number
        };
        sendEdits(editMessage: string): void;
        applyServerEdits(serverEdits: {}): void;
        applyServerEdit(editMessage: {}): boolean;

    }
    export interface IServer {
        new (adapter: any, transport: any, diffOptions: {}): IServer;
        adapter: any;
        transport: any;
        data: {};
        requests: {};
        saveRequests: {};
        saveQueue: {};
        trackConnection(): void; // TODO
        jsondiffpatch: any;
        trackConnection(connection: IConnection): void;
        joinConnection(connection: IConnection, room: string, initializeClient: Function): void;
        getData(room: string, callback: Function): void;
        receiveEdit(connection: IConnection, editMessage: {}, sendToClient: Function): void;
        saveSnapshot(room: string): void;
        sendServerChanges(doc: IDoc, clientDoc: IDoc, send: Function): void;
    }

    export interface ICOMMANDS {
        join: string;
        syncWithServer: string;
        remoteUpdateIncoming: string;
        error: string;
    }

    export interface IInMemoryDataAdapter {
        cache: {};
        getData(id: string | number, cb: Function);
        storeData(id: string | number, data: any, cb: Function);
    }

    export interface IDoc {
        localVersion: number;
        serverVersion: number;
        shadow: {};
        localCopy: {};
        edit: any[];
    }

    export interface IDiff {
        // TODO
    }
    export interface IConnection {
        // TODO
    }
}

declare module "diffsync" {
    export = diffsync;
}
