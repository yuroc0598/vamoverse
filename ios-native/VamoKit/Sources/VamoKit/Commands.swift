// Typed command constants. Names and inputs follow docs/api/commands.json; add commands here as
// screens need them, with a model in Models.swift and a fixture test.

extension Command where Input == NoInput, Output == Account? {
    /// The signed-in account, or nil when signed out (access: public).
    public static var accountMe: Self { .init("account.me") }
}

extension Command where Input == NotificationsInput, Output == NotificationsPage {
    /// Recent notifications and the unread count (access: user).
    public static var notificationsList: Self { .init("notifications.list") }
}
