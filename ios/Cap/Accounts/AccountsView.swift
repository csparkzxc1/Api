import SwiftUI
import CapAPI
import CapModels

struct AccountsView: View {
    @EnvironmentObject private var state: AppState
    @State private var showingAdd = false
    @State private var inFlightDelete: String?

    var body: some View {
        NavigationStack {
            List {
                ForEach(state.accounts) { account in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(account.label).font(.headline)
                            Text(account.provider.rawValue.capitalized)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        statusBadge(account)
                    }
                }
                .onDelete(perform: delete)
            }
            .navigationTitle("Accounts")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingAdd = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingAdd) {
                AddAccountView { newAccount in
                    state.accounts.append(newAccount)
                }
            }
            .refreshable { await state.refresh() }
        }
    }

    @ViewBuilder
    private func statusBadge(_ a: Account) -> some View {
        switch a.status {
        case .active: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .pending: ProgressView()
        case .error: Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
        }
    }

    private func delete(at offsets: IndexSet) {
        let ids = offsets.map { state.accounts[$0].id }
        state.accounts.remove(atOffsets: offsets)
        Task {
            for id in ids {
                try? await state.client.deleteAccount(id: id)
            }
        }
    }
}
