import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import { ExtensionData, IThemeExtensionPoint, IWorkbenchProductIconTheme } from "@codingame/monaco-vscode-api/vscode/vs/workbench/services/themes/common/workbenchThemeService";
import { IStorageService } from "@codingame/monaco-vscode-api/vscode/vs/platform/storage/common/storage.service";
import { ILogService } from "@codingame/monaco-vscode-api/vscode/vs/platform/log/common/log.service";
import { IconDefinition, IconContribution } from "@codingame/monaco-vscode-api/vscode/vs/platform/theme/common/iconRegistry";
import { IExtensionResourceLoaderService } from "@codingame/monaco-vscode-api/vscode/vs/platform/extensionResourceLoader/common/extensionResourceLoader.service";
export declare const DEFAULT_PRODUCT_ICON_THEME_ID = "";
export declare class ProductIconThemeData implements IWorkbenchProductIconTheme {
    static readonly STORAGE_KEY = "productIconThemeData";
    id: string;
    label: string;
    settingsId: string;
    description?: string;
    isLoaded: boolean;
    location?: URI;
    extensionData?: ExtensionData;
    watch?: boolean;
    iconThemeDocument: ProductIconThemeDocument;
    styleSheetContent?: string;
    private constructor();
    getIcon(iconContribution: IconContribution): IconDefinition | undefined;
    ensureLoaded(fileService: IExtensionResourceLoaderService, logService: ILogService): Promise<string | undefined>;
    reload(fileService: IExtensionResourceLoaderService, logService: ILogService): Promise<string | undefined>;
    private load;
    static fromExtensionTheme(iconTheme: IThemeExtensionPoint, iconThemeLocation: URI, extensionData: ExtensionData): ProductIconThemeData;
    static createUnloadedTheme(id: string): ProductIconThemeData;
    private static _defaultProductIconTheme;
    static get defaultTheme(): ProductIconThemeData;
    static fromStorageData(storageService: IStorageService): ProductIconThemeData | undefined;
    toStorage(storageService: IStorageService): void;
}
interface ProductIconThemeDocument {
    iconDefinitions: Map<string, IconDefinition>;
}
export {};
