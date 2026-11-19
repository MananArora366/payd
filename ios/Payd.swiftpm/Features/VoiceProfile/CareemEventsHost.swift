import OSLog
import PaydCore
import SwiftUI

/// Port of web/src/lib/careem/useCareemEvents.ts + web/src/components/careem/CareemSplitPrompt.tsx and the
/// page.tsx wiring: polls `GET /api/careem/events` every 2 s while a server is set and the app is active,
/// and asks "Split this with others?" for the oldest pending order or ride.
struct CareemEventsHost: View {
    @Environment(AppSettings.self) private var settings
    @Environment(AppRouter.self) private var router
    @Environment(\.scenePhase) private var scenePhase

    @State private var events: [CareemEvent] = []
    /// Ids decided locally; filtered out of poll results until the server stops returning them.
    @State private var decided: Set<String> = []

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "careem")

    init() {}

    private var pollKey: String { "\(settings.serverBaseURL)|\(scenePhase == .active)" }

    var body: some View {
        ZStack(alignment: .bottom) {
            // page.tsx: `event={anyModalOpen ? null : careem.current}`
            if router.sheet == nil, let event = CareemEvents.current(events) {
                CareemSplitPrompt(event: event, pendingCount: events.count, onSplit: split, onDismiss: dismiss)
                    .id(event.id)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 96)
                    .transition(.opacity.combined(with: .offset(y: 24)).combined(with: .scale(scale: 0.98)))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .animation(.easeOut(duration: 0.3), value: router.sheet == nil ? CareemEvents.current(events)?.id : nil)
        .task(id: pollKey) { await pollLoop() }
    }

    // MARK: - Polling (useCareemEvents.ts:61-104)

    private func pollLoop() async {
        guard settings.isOnline, scenePhase == .active else { return }
        let api = settings.api
        while !Task.isCancelled {
            await poll(api)
            try? await Task.sleep(for: .seconds(CareemEvents.pollIntervalSeconds))
        }
    }

    private func poll(_ api: PaydAPI) async {
        do {
            let pending = try await api.careemEvents()
            guard !Task.isCancelled else { return }
            let serverIds = Set(pending.map(\.id))
            // Forget decided ids the server no longer reports as pending.
            decided = decided.intersection(serverIds)
            events = pending.filter { !decided.contains($0.id) }
        } catch {
            // Ignored like the web; the next tick retries.
            Self.logger.debug("Careem poll failed: \(String(describing: error), privacy: .public)")
        }
    }

    /// `decide()`: hide locally (optimistic), then tell the server. Every outcome keeps it hidden.
    private func decide(_ event: CareemEvent, _ decision: CareemDecision) {
        decided.insert(event.id)
        events = events.filter { $0.id != event.id }
        let api = settings.api
        Task {
            let result = await api.decideCareemEvent(id: event.id, decision: decision)
            if result != .ok {
                Self.logger.info("Careem decision for \(event.id, privacy: .public) not applied: \(String(describing: result), privacy: .public)")
            }
        }
    }

    /// page.tsx `handleCareemSplit`.
    private func split(_ event: CareemEvent) {
        decide(event, .split)
        router.present(.addExpense(AddExpenseRequest(type: .expense, groupId: nil,
                                                     prefill: CareemEvents.prefill(for: event))))
    }

    private func dismiss(_ event: CareemEvent) {
        decide(event, .dismiss)
    }
}

/// CareemSplitPrompt.tsx: the bottom card.
private struct CareemSplitPrompt: View {
    let event: CareemEvent
    let pendingCount: Int
    let onSplit: (CareemEvent) -> Void
    let onDismiss: (CareemEvent) -> Void

    /// So a double tap can't decide the same event twice (the server would answer 409).
    @State private var answered = false

    private var amount: String {
        Currency.format(event.amountMinor, currency: event.currency.isEmpty ? "AED" : event.currency)
    }

    private var serviceIcon: String {
        switch event.service {
        case .ride: "car"
        case .food: "fork.knife"
        case .groceries: "basket"
        case .box: "shippingbox"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            orderSummary
            question
            HStack(spacing: 10) {
                Button("No") { answer(split: false) }
                    .buttonStyle(VoiceProfileButtonStyle(text: PaydTheme.zinc300, stroke: Color.white.opacity(0.1),
                                                         cornerRadius: 16, verticalPadding: 12))
                    .accessibilityLabel("No, don't split this")
                Button("Yes, split") { answer(split: true) }
                    .buttonStyle(VoiceProfileButtonStyle(fill: PaydTheme.emerald600, text: .white, cornerRadius: 16,
                                                         verticalPadding: 12))
                    .accessibilityLabel("Yes, split this with others")
            }
        }
        .padding(20)
        .frame(maxWidth: 448)
        .background(PaydTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.careemGreen.opacity(0.25)))
        .shadow(color: .black.opacity(0.6), radius: 25, y: 12)
        .accessibilityElement(children: .contain)
    }

    private var header: some View {
        HStack {
            HStack(spacing: 8) {
                Text("C")
                    .font(.payd(size: 10, bold: true))
                    .foregroundStyle(.black)
                    .frame(width: 20, height: 20)
                    .background(PaydTheme.careemGreen, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .accessibilityHidden(true)
                Text(CareemEvents.serviceLabel(event.service).uppercased())
                    .font(.paydHeading(size: 10))
                    .tracking(0.5)
                    .foregroundStyle(PaydTheme.careemGreen)
                // Keep the relative time fresh (every 15 s).
                TimelineView(.periodic(from: .now, by: 15)) { context in
                    Text("· \(CareemEvents.relativeTime(event.occurredAt, now: context.date))")
                        .font(.payd(size: 10))
                        .foregroundStyle(PaydTheme.zinc500)
                }
            }
            Spacer()
            Button {
                answer(split: false)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PaydTheme.zinc500)
                    .padding(6)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss, don't split")
        }
    }

    private var orderSummary: some View {
        let subtitle = CareemEvents.subtitle(event)
        let itemCount = CareemEvents.itemCount(event)
        return HStack(spacing: 12) {
            Image(systemName: serviceIcon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(PaydTheme.careemGreen)
                .frame(width: 44, height: 44)
                .background(PaydTheme.careemGreen.opacity(0.2), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(event.title)
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.payd(size: 11))
                        .foregroundStyle(PaydTheme.zinc400)
                        .lineLimit(1)
                }
                if itemCount > 0 {
                    Text("\(itemCount) \(itemCount == 1 ? "item" : "items")")
                        .font(.payd(size: 10))
                        .foregroundStyle(PaydTheme.zinc500)
                        .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(amount)
                .font(.payd(size: 16, bold: true))
                .tracking(-0.4)
                .foregroundStyle(.white)
                .monospacedDigit()
                .fixedSize()
        }
        .padding(14)
        .background(PaydTheme.emerald500.opacity(0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.emerald500.opacity(0.2)))
    }

    private var question: some View {
        let extra = max(0, pendingCount - 1)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "person.2")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PaydTheme.careemGreen)
                    .accessibilityHidden(true)
                Text("Split this with others?")
                    .paydHeadingFont(size: 14)
                    .tracking(0.35)
                    .foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
            }
            (Text("Add it to Payd and choose who to split \(amount) with.")
                + Text(extra > 0 ? " · \(extra) more pending" : "").foregroundStyle(PaydTheme.zinc500))
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func answer(split: Bool) {
        guard !answered else { return }
        answered = true
        if split { onSplit(event) } else { onDismiss(event) }
    }
}
