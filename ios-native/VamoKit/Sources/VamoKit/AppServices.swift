import Foundation

// Push devices, the assistant, and notification payloads (phase 5).

// MARK: Devices

public struct RegisterDeviceInput: Encodable, Sendable {
    /// The APNs device token as hex.
    public let token: String
    /// sandbox (development builds) or production (App Store / TestFlight).
    public let environment: String
    public init(token: String, environment: String) { self.token = token; self.environment = environment }
}

public struct DeviceTokenInput: Encodable, Sendable {
    public let token: String
    public init(token: String) { self.token = token }
}

extension Command where Input == RegisterDeviceInput, Output == Ignored { public static var devicesRegister: Self { .init("devices.register") } }
extension Command where Input == DeviceTokenInput, Output == Ignored { public static var devicesUnregister: Self { .init("devices.unregister") } }

/// APNs hands the token over as bytes; the server stores it as lowercase hex.
public func deviceTokenHex(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
}

// MARK: Notification payloads

public enum PushPayload {
    /// Where a tapped notification should go: the server puts the web path in `link`
    /// (`/b/<id>?t=…`, `/sessions/<id>`, `/messages/<id>`); no link opens Home.
    public static func link(from userInfo: [AnyHashable: Any]) -> AppLink {
        guard let path = userInfo["link"] as? String, !path.isEmpty else { return .home }
        return AppLink.parse(path)
    }
}

// MARK: Assistant

/// A change the assistant proposes; nothing happens until the user confirms.
public struct PendingAction: Decodable, Sendable, Equatable, Identifiable {
    public struct Item: Decodable, Sendable, Equatable {
        public let command: String
        /// Written by the server from the real input (what will happen).
        public let description: String
        /// The model's wording.
        public let note: String
    }

    public let id: String
    public let actions: [Item]
}

public struct AssistantLine: Decodable, Sendable, Equatable {
    /// user, assistant (and `result` lines the app adds after confirming)
    public let role: String
    public let text: String
    public init(role: String, text: String) { self.role = role; self.text = text }
}

/// `assistant.history`
public struct AssistantHistory: Decodable, Sendable, Equatable {
    /// False when the server has no model key (the assistant is hidden, as on the web).
    public let enabled: Bool
    public let messages: [AssistantLine]
    public let pendingAction: PendingAction?
}

/// `assistant.send`
public struct AssistantReply: Decodable, Sendable, Equatable {
    public let reply: String
    public let pendingAction: PendingAction?
}

/// `assistant.resolve`
public struct AssistantOutcomes: Decodable, Sendable, Equatable {
    public struct Outcome: Decodable, Sendable, Equatable {
        public let summary: String
        public let ok: Bool
        public let message: String
    }

    public let outcomes: [Outcome]
}

public struct AssistantSendInput: Encodable, Sendable {
    public let text: String
    public init(text: String) { self.text = text }
}

public struct AssistantResolveInput: Encodable, Sendable {
    public let actionId: String
    /// confirm or cancel
    public let decision: String
    public init(actionId: String, decision: String) { self.actionId = actionId; self.decision = decision }
}

extension Command where Input == NoInput, Output == AssistantHistory { public static var assistantHistory: Self { .init("assistant.history") } }
extension Command where Input == AssistantSendInput, Output == AssistantReply { public static var assistantSend: Self { .init("assistant.send") } }
extension Command where Input == AssistantResolveInput, Output == AssistantOutcomes { public static var assistantResolve: Self { .init("assistant.resolve") } }
extension Command where Input == NoInput, Output == Ignored { public static var assistantReset: Self { .init("assistant.reset") } }
