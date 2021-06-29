# WIP
# Intoduction
On the XRPL, ledgers (blocks) are closed and sealed in the following way:
1. A quorum of validators on the UNL collectively agrees upon a set of (mempool) transactions to apply
2. The set is placed into a canonical order and applied to the last closed ledger
3. The outcome is deterministically replicated by each validator
4. The outcome is signed by each validator
5. The validators move on to a new ledger that references the old ledger.

Each ledger contains among other things a `tx root` which is a root of a merkle tree containing the transaction set applied in the creation of this ledger and the outcomes (metadata).

We add the trust assumption that a quorum of validators will never (collectively) act maliciously.

Now, by collecting validations, it is possible to prove for a specific transaction that:
1. It was accepted into a specific ledger, and
2. Had a specific outcome (metadata)

# Proof of Validation
PoV will be a standardized succinct non-iteractive (offline) proof that an XRPL transaction was applied to the Ledger and had some specific result.

It will contain at least the following parts:
1. A transaction and corresponding result (metadata) whose acceptance into a ledger is the subject of this proof.
2. Valdiation signatures over a the ledger hash of the ledger the transaction was accepted into (the tx ledger), or
2a. An unbroken chain of ledger headers from the tx ledger to some future ledger, and
2b. Validation signatures over that future ledger.
3. The ledger header of the tx ledger.
4. The minimum set of nodes from the ledger's tx merkle tree to prove the transaction and its metadata appeared in the ledger.

# Format
The proposed format is compressed concatenated STObject transmitted as a QR code. More on this when an XLS is created.
