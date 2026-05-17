
import { WorkbenchThemeService } from './vscode/src/vs/workbench/services/themes/browser/workbenchThemeService.js';
import { IThemeService } from '@codingame/monaco-vscode-api/vscode/vs/platform/theme/common/themeService.service';
import { SyncDescriptor } from '@codingame/monaco-vscode-api/vscode/vs/platform/instantiation/common/descriptors';
import { ConfigurationTarget } from '@codingame/monaco-vscode-api/vscode/vs/platform/configuration/common/configuration';
import getServiceOverride$1 from '@codingame/monaco-vscode-files-service-override';
import './vscode/src/vs/workbench/contrib/themes/browser/themes.contribution.js';

class StandaloneWorkbenchThemeService extends WorkbenchThemeService {
    registerEditorContainer() {
        return {
            dispose() { }
        };
    }
    setTheme(themeName) {
        void this.getColorThemes().then((themes) => {
            setTimeout(() => {
                void this.setColorTheme(themes.find((theme) => theme.settingsId === themeName) ?? themeName, ConfigurationTarget.MEMORY);
            });
        });
    }
}
function getServiceOverride() {
    return {
        ...getServiceOverride$1(),
        [IThemeService.toString()]: new SyncDescriptor(StandaloneWorkbenchThemeService, [], false)
    };
}

export { getServiceOverride as default };
