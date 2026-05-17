import type { IThemeExtensionPoint } from "@codingame/monaco-vscode-api/vscode/vs/workbench/services/themes/common/workbenchThemeService";
import type { IEditorOverrideServices } from "@codingame/monaco-vscode-api/vscode/vs/editor/standalone/browser/standaloneServices";
type PartialIThemeExtensionPoint = Partial<IThemeExtensionPoint> & Pick<IThemeExtensionPoint, "id" | "path">;
export default function getServiceOverride(): IEditorOverrideServices;
export type { PartialIThemeExtensionPoint as IThemeExtensionPoint };
