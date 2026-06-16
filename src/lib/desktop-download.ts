type DesktopRole = 'admin' | 'employee'
type DesktopPlatform = 'windows' | 'mac'

export function resolveDesktopInstallerUrl(role: DesktopRole, platform: DesktopPlatform): string | null {
  const byRolePlatform =
    role === 'employee'
      ? platform === 'mac'
        ? process.env.DESKTOP_INSTALLER_URL_EMPLOYEE_MAC
        : process.env.DESKTOP_INSTALLER_URL_EMPLOYEE_WINDOWS
      : platform === 'mac'
        ? process.env.DESKTOP_INSTALLER_URL_ADMIN_MAC
        : process.env.DESKTOP_INSTALLER_URL_ADMIN_WINDOWS

  const byPlatform = platform === 'mac' ? process.env.DESKTOP_INSTALLER_URL_MAC : process.env.DESKTOP_INSTALLER_URL

  return byRolePlatform || byPlatform || process.env.DESKTOP_INSTALLER_URL || null
}

export const DESKTOP_DOWNLOAD_ENV_HELP =
  'Installer not configured. Set DESKTOP_INSTALLER_URL plus optional role/platform URLs (DESKTOP_INSTALLER_URL_ADMIN_WINDOWS, DESKTOP_INSTALLER_URL_ADMIN_MAC, DESKTOP_INSTALLER_URL_EMPLOYEE_WINDOWS, DESKTOP_INSTALLER_URL_EMPLOYEE_MAC).'
