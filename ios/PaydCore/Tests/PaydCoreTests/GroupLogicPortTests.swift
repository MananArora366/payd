import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/components/groups/__tests__/groupLogic.test.ts.
struct GroupLogicPortTests {
    private let groups = [
        Group(id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Dubai Flatmates", description: "", creatorId: "u1", createdAt: PaydJSON.epoch),
        Group(id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "Hatta Road Trip", description: "", creatorId: "u1", createdAt: PaydJSON.epoch),
    ]

    @Test("extracts the token from full URLs, paths and bare tokens")
    func extracts() {
        #expect(GroupLogic.extractInviteToken("http://localhost:3000/join/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        #expect(GroupLogic.extractInviteToken("  https://payd.app/join/dubai-marina-2026/?ref=wa#x ") == "dubai-marina-2026")
        #expect(GroupLogic.extractInviteToken("/join/hatta-camp-2026") == "hatta-camp-2026")
        #expect(GroupLogic.extractInviteToken("dubai-marina-2026") == "dubai-marina-2026")
        #expect(GroupLogic.extractInviteToken("") == "")
        #expect(GroupLogic.extractInviteToken("/join/a%20b") == "a b")
        #expect(GroupLogic.extractInviteToken("/join/bad%zz") == "bad%zz")
    }

    @Test("extractJoinToken (PaydContext variant) handles URLs, paths and bare tokens")
    func joinToken() {
        #expect(GroupLogic.extractJoinToken("https://payd.app/join/dubai-marina-2026?ref=wa#x") == "dubai-marina-2026")
        #expect(GroupLogic.extractJoinToken("  /JOIN/hatta-camp-2026/ ") == "hatta-camp-2026")
        #expect(GroupLogic.extractJoinToken("abc///") == "abc")
        #expect(GroupLogic.extractJoinToken("   ") == "")
    }

    @Test("resolves only exact matches (group id or demo token)")
    func resolves() {
        #expect(GroupLogic.resolveInviteGroup("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", groups: groups)?.name == "Dubai Flatmates")
        #expect(GroupLogic.resolveInviteGroup("dubai-marina-2026", groups: groups)?.name == "Dubai Flatmates")
        #expect(GroupLogic.resolveInviteGroup("http://x/join/hatta-camp-2026", groups: groups)?.name == "Hatta Road Trip")
        #expect(GroupLogic.resolveInviteGroup("anything", groups: groups) == nil)
        #expect(GroupLogic.resolveInviteGroup("marina", groups: groups) == nil)
        #expect(GroupLogic.resolveInviteGroup("", groups: groups) == nil)
    }

    @Test("filters groups to those the user belongs to")
    func filters() {
        let members = [GroupMember(groupId: groups[0].id, userId: "priya", joinedAt: PaydJSON.epoch)]
        #expect(GroupLogic.filterGroupsForUser(groups, members: members, userId: "priya").map(\.name) == ["Dubai Flatmates"])
        #expect(GroupLogic.filterGroupsForUser(groups, members: members, userId: "nobody").isEmpty)
    }

    @Test("picks sensible emojis")
    func emojis() {
        #expect(PaydFormat.groupEmoji("Dubai Flatmates") == "🏙️")
        #expect(PaydFormat.groupEmoji("Hatta Road Trip") == "🏕️")
        #expect(PaydFormat.groupEmoji("Supper Club") == "🍷")
        #expect(PaydFormat.groupEmoji("Random") == "👥")
    }

    @Test("sums balances")
    func sums() {
        #expect(GroupLogic.sumBalances(["a": 500, "b": -300, "c": -200]) == 0)
        #expect(GroupLogic.sumBalances(["a": 500, "b": -300]) == 200)
        #expect(GroupLogic.sumBalances([:]) == 0)
    }

    @Test("validates amounts without throwing")
    func amounts() {
        #expect(GroupLogic.parseAmountInput("45.00") == .success(4500))
        #expect(GroupLogic.parseAmountInput("-5") == .failure(ParseError("Amount cannot be negative.")))
        #expect(GroupLogic.parseAmountInput("0") == .failure(ParseError("Please enter an amount greater than AED 0.")))
        #expect(GroupLogic.parseAmountInput("") == .failure(ParseError("Please enter an amount.")))
        for bad in ["abc", "1e3", "1.2.3"] {
            #expect((try? GroupLogic.parseAmountInput(bad).get()) == nil)
        }
        #expect(GroupLogic.parseAmountInput("1,250.50") == .success(125050))
    }

    @Test("weights debtors by +1 per AED 25 owed, capped at +10")
    func weights() {
        let w = GroupLogic.rouletteWeights(userIds: ["a", "b", "c", "d"], groupBalances: ["a": -2500, "b": 5000, "c": -100000],
                                           mode: .debtWeighted)
        #expect(w.map(\.weight) == [2, 1, 11, 1])
        #expect(GroupLogic.rouletteWeights(userIds: ["a", "c"], groupBalances: ["a": -2500, "c": -100000], mode: .equal).map(\.weight) == [1, 1])
        #expect(GroupLogic.rouletteWeights(userIds: ["a"], groupBalances: ["a": -2501], mode: .debtWeighted).map(\.weight) == [3])
    }

    @Test("picks weighted indices across the full range")
    func picks() {
        #expect(GroupLogic.pickWeightedIndex([1, 1], rand01: 0) == 0)
        #expect(GroupLogic.pickWeightedIndex([1, 1], rand01: 0.49) == 0)
        #expect(GroupLogic.pickWeightedIndex([1, 1], rand01: 0.5) == 1)
        #expect(GroupLogic.pickWeightedIndex([1, 3], rand01: 0.3) == 1)
        #expect(GroupLogic.pickWeightedIndex([], rand01: 0.3) == -1)
    }
}
