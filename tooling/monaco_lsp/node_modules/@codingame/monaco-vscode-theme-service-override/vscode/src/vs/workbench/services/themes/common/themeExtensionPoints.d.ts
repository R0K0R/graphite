import { IExtensionPoint } from "@codingame/monaco-vscode-api/vscode/vs/workbench/services/extensions/common/extensionsRegistry";
import { ExtensionData, IThemeExtensionPoint } from "@codingame/monaco-vscode-api/vscode/vs/workbench/services/themes/common/workbenchThemeService";
import { Event } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import { IDisposable } from "@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle";
export declare function registerColorThemeExtensionPoint(): IExtensionPoint<IThemeExtensionPoint[]>;
export declare function registerFileIconThemeExtensionPoint(): IExtensionPoint<IThemeExtensionPoint[]>;
export declare function registerProductIconThemeExtensionPoint(): IExtensionPoint<IThemeExtensionPoint[]>;
export interface ThemeChangeEvent<T> {
    themes: T[];
    added: T[];
    removed: T[];
}
export interface IThemeData {
    id: string;
    settingsId: string | null;
    location?: URI;
}
export declare class ThemeRegistry<T extends IThemeData> implements IDisposable {
    private readonly themesExtPoint;
    private create;
    private idRequired;
    private builtInTheme;
    private extensionThemes;
    private readonly onDidChangeEmitter;
    readonly onDidChange: Event<ThemeChangeEvent<T>>;
    constructor(themesExtPoint: IExtensionPoint<IThemeExtensionPoint[]>, create: (theme: IThemeExtensionPoint, themeLocation: URI, extensionData: ExtensionData) => T, idRequired?: boolean, builtInTheme?: T | undefined);
    dispose(): void;
    private initialize;
    private onThemes;
    findThemeById(themeId: string): T | undefined;
    findThemeBySettingsId(settingsId: string | null, defaultSettingsId?: string): T | undefined;
    findThemeByExtensionLocation(extLocation: URI | undefined): T[];
    getThemes(): T[];
    getMarketplaceThemes(manifest: any, extensionLocation: URI, extensionData: ExtensionData): T[];
}
