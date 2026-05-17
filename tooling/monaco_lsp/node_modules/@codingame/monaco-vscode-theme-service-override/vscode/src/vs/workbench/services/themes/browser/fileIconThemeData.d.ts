import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import { ExtensionData, IThemeExtensionPoint, IWorkbenchFileIconTheme } from "@codingame/monaco-vscode-api/vscode/vs/workbench/services/themes/common/workbenchThemeService";
import { IStorageService } from "@codingame/monaco-vscode-api/vscode/vs/platform/storage/common/storage.service";
import { IExtensionResourceLoaderService } from "@codingame/monaco-vscode-api/vscode/vs/platform/extensionResourceLoader/common/extensionResourceLoader.service";
import { ILanguageService } from "@codingame/monaco-vscode-api/vscode/vs/editor/common/languages/language.service";
export declare class FileIconThemeData implements IWorkbenchFileIconTheme {
    static readonly STORAGE_KEY = "iconThemeData";
    id: string;
    label: string;
    settingsId: string | null;
    description?: string;
    hasFileIcons: boolean;
    hasFolderIcons: boolean;
    hidesExplorerArrows: boolean;
    isLoaded: boolean;
    location?: URI;
    extensionData?: ExtensionData;
    watch?: boolean;
    styleSheetContent?: string;
    private constructor();
    ensureLoaded(themeLoader: FileIconThemeLoader): Promise<string | undefined>;
    reload(themeLoader: FileIconThemeLoader): Promise<string | undefined>;
    private load;
    static fromExtensionTheme(iconTheme: IThemeExtensionPoint, iconThemeLocation: URI, extensionData: ExtensionData): FileIconThemeData;
    private static _noIconTheme;
    static get noIconTheme(): FileIconThemeData;
    static createUnloadedTheme(id: string): FileIconThemeData;
    static fromStorageData(storageService: IStorageService): FileIconThemeData | undefined;
    toStorage(storageService: IStorageService): void;
}
export declare class FileIconThemeLoader {
    private readonly fileService;
    private readonly languageService;
    constructor(fileService: IExtensionResourceLoaderService, languageService: ILanguageService);
    load(data: FileIconThemeData): Promise<string | undefined>;
    private loadIconThemeDocument;
    private processIconThemeDocument;
    /**
     * Try converting absolute font sizes to relative values.
     *
     * This allows them to be scaled nicely depending on where they are used.
     */
    private tryNormalizeFontSize;
}
