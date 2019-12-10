const {
    Account,
    PublicAccount,
    Mosaic,
    MosaicId,
    NetworkType,
    HashLockTransaction,
    Deadline,
    TransactionHttp,
    UInt64,
    AggregateTransaction,
    MultisigAccountModificationTransaction,
    Listener,
} = require('nem2-sdk');
const { merge } = require('rxjs');
const { filter, mergeMap } = require('rxjs/operators');

// Setup network Info
const networkType = NetworkType.TEST_NET
const endpoint = 'http://api-harvest-01.ap-northeast-1.nemtech.network:3000'
const networkGenerationHash = '6C0350A10724FC325A1F06CEFC4CA14464BC472F566842D22418AEE0F8746B4C'

// Setup all Account

const MultiSigPrivateKey = 'PrivateKey here'
const MultiSigAccount = Account.createFromPrivateKey(MultiSigPrivateKey, networkType);

const userManagementAdminPrivateKey = 'PrivateKey here'
const userManagementAdminAccount = Account.createFromPrivateKey(userManagementAdminPrivateKey, networkType);

const catapultAcademyAdminPublicKey = 'Publickey here'
const catapultAcademyAdminAccount = PublicAccount.createFromPublicKey(catapultAcademyAdminPublicKey, networkType);

const userPublicKey = 'Publickey here'
const userAccount = PublicAccount.createFromPublicKey(userPublicKey, networkType);

// Step 2 Prepare Multisig Transaction
// MinApproval = 1, and MinRemoval = 2
const multisigAccountModificationTransaction = MultisigAccountModificationTransaction.create(
    Deadline.create(),
    1,
    2,
    [userManagementAdminAccount.publicAccount, catapultAcademyAdminAccount, userAccount],
    [],
    networkType,
    UInt64.fromUint(200000));

const aggregateTransaction = AggregateTransaction.createBonded(
    Deadline.create(),
    [multisigAccountModificationTransaction.toAggregate(MultiSigAccount.publicAccount)],
    networkType,
    [],
    UInt64.fromUint(200000));

// Sign the Transaction
const signedTransaction = MultiSigAccount.sign(aggregateTransaction, networkGenerationHash);
console.log(signedTransaction.hash);


// Hash lock needed for Aggregate Boned
// let User Management Admin pay lock function
// 46BE9BC0626F9B1A is network currency
const hashLockTransaction = HashLockTransaction.create(
    Deadline.create(),
    new Mosaic(new MosaicId('46BE9BC0626F9B1A'), UInt64.fromUint(10000000)),
    UInt64.fromUint(480),
    signedTransaction,
    networkType,
    UInt64.fromUint(200000));

const signedHashLockTransaction = userManagementAdminAccount.sign(hashLockTransaction, networkGenerationHash);


// Ready announce to Network
const transactionHttp = new TransactionHttp(endpoint);
const listener = new Listener(endpoint);

// announce hash lock
const announceHashLockTransaction = (signedHashLockTransaction) => {
    return transactionHttp.announce(signedHashLockTransaction);
};

const announceAggregateTransaction = (listener,
    signedHashLockTransaction,
    signedAggregateTransaction,
    senderAddress) => {
    return listener
        .confirmed(senderAddress)
        .pipe(
            filter((transaction) => transaction.transactionInfo !== undefined
                && transaction.transactionInfo.hash === signedHashLockTransaction.hash),
            mergeMap(ignored => {
                listener.terminate();
                // announce Aggregate Bonded transaction
                return transactionHttp.announceAggregateBonded(signedAggregateTransaction)
            })
        );
};

listener.open().then(() => {
    merge(announceHashLockTransaction(signedHashLockTransaction),
        announceAggregateTransaction(listener, signedHashLockTransaction, signedTransaction, userManagementAdminAccount.address))
        .subscribe(x => console.log('Transaction confirmed:', x.message),
            err => console.log(err));
});