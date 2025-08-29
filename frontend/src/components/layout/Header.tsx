import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, Bell, User, LogOut, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore, useSidebarStore, useNotificationStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface HeaderProps {
  className?: string
}

export function Header({ className }: HeaderProps) {
  const { user, logout } = useAuthStore()
  const { toggle } = useSidebarStore()
  const { notifications } = useNotificationStore()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <header className={cn(
      "w-full border-b bg-background",
      className
    )}>
      <div className="flex h-16 items-center px-6">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden mr-4"
          onClick={toggle}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="ml-auto flex items-center space-x-4">
          {/* Notifications */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-xs text-destructive-foreground flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>

            {/* Notifications dropdown - simplified for now */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-md border bg-popover p-4 shadow-md">
                <h4 className="font-medium mb-2">Notificações</h4>
                {notifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notifications.slice(0, 5).map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          "p-2 rounded text-sm",
                          !notification.read && "bg-accent"
                        )}
                      >
                        <div className="font-medium">{notification.title}</div>
                        <div className="text-muted-foreground">{notification.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <User className="h-5 w-5" />
            </Button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 rounded-md border bg-popover p-1 shadow-md">
                <div className="px-3 py-2 border-b">
                  <div className="font-medium">{user?.name}</div>
                  <div className="text-sm text-muted-foreground">{user?.email}</div>
                </div>
                
                <Link
                  to="/app/settings"
                  className="flex items-center px-3 py-2 text-sm hover:bg-accent rounded-sm"
                  onClick={() => setShowUserMenu(false)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Configurações
                </Link>
                
                <Link
                  to="/app/api-keys"
                  className="flex items-center px-3 py-2 text-sm hover:bg-accent rounded-sm"
                  onClick={() => setShowUserMenu(false)}
                >
                  API Keys
                </Link>
                
                <button
                  onClick={() => {
                    logout()
                    setShowUserMenu(false)
                  }}
                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent rounded-sm text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}