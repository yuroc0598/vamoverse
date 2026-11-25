import SwiftUI
import VamoKit

/// Short messages at the top of the screen, like the web's toasts: server errors verbatim, and
/// confirmations ("Notes saved"). VoiceOver reads each one.
@MainActor @Observable
final class Toasts {
    struct Toast: Identifiable, Equatable {
        enum Kind { case error, success }
        let id = UUID()
        let kind: Kind
        let message: String
    }

    private(set) var current: Toast?
    private var dismissal: Task<Void, Never>?

    func error(_ error: APIError) { show(.init(kind: .error, message: error.message)) }
    func success(_ message: String) { show(.init(kind: .success, message: message)) }

    func dismiss() {
        dismissal?.cancel()
        current = nil
    }

    private func show(_ toast: Toast) {
        current = toast
        AccessibilityNotification.Announcement(toast.message).post()
        dismissal?.cancel()
        dismissal = Task { [weak self] in
            try? await Task.sleep(for: .seconds(toast.kind == .error ? 6 : 3))
            guard !Task.isCancelled else { return }
            self?.current = nil
        }
    }
}

extension View {
    /// Shows `Toasts.current` over this view.
    func toastOverlay(_ toasts: Toasts) -> some View {
        overlay(alignment: .top) {
            if let toast = toasts.current {
                ToastView(toast: toast) { toasts.dismiss() }
                    .padding(.horizontal)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .id(toast.id)
            }
        }
        .animation(.snappy, value: toasts.current)
    }
}

private struct ToastView: View {
    let toast: Toasts.Toast
    let dismiss: () -> Void

    var body: some View {
        Button(action: dismiss) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: toast.kind == .error ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(toast.kind == .error ? Color.red : Color.green)
                Text(toast.message)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("toast")
        .accessibilityHint("Dismiss")
    }
}
