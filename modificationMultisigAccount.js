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
    MultisigHttp
} = require('nem2-sdk');
const { merge } = require('rxjs');
const { filter, mergeMap } = require('rxjs/operators');

// Setup network Info
const networkType = NetworkType.TEST_NET
const endpoint = 'http://api-harvest-01.ap-northeast-1.nemtech.network:3000'
const networkGenerationHash = '6C0350A10724FC325A1F06CEFC4CA14464BC472F566842D22418AEE0F8746B4C'

// Setup all Account
const MultiSigPrivateKey = 'PrivateKey here'
// const MultiSigAccount = Account.createFromPrivateKey(MultiSigPrivateKey, networkType);

const userManagementAdminPrivateKey = 'PrivateKey here'
// const userManagementAdminAccount = Account.createFromPrivateKey(userManagementAdminPrivateKey, networkType);

const newUserPublicKey = 'PublicKey here'
// const newUserAccount = PublicAccount.createFromPublicKey(newUserPublicKey, networkType);

// Retrive Cosigner from Multisign Account
const multisigHttp = new MultisigHttp(endpoint);

const MultisigAddress = PublicAccount.createFromPublicKey('D8471A5DF762AC7413F73B1EB8A39C1C93431C4F747C357E6FE21D2F1CDB62FE', networkType)

multisigHttp.getMultisigAccountInfo(MultisigAddress.address).subscribe(info => {
    console.log("Cosignatories List")
    console.log("=======================")
    info.cosignatories.map(cosigner => {
        console.log("Address: " + cosigner.address.plain())
        console.log("Public Key: " + cosigner.publicKey)
        console.log("=======================")
    })
})

const oldUserPublicKey = 'PublicKey here'
const oldUserAccount = PublicAccount.createFromPublicKey(oldUserPublicKey, networkType);

// Step 2 Prepare Multisig Transaction
const multisigAccountModificationTransaction = MultisigAccountModificationTransaction.create(
    Deadline.create(),
    0,
    0,
    [newUserAccount],
    [oldUserAccount],
    networkType,
    UInt64.fromUint(200000));

const aggregateTransaction = AggregateTransaction.createBonded(
    Deadline.create(),
    [multisigAccountModificationTransaction.toAggregate(MultiSigAccount.publicAccount)],
    networkType,
    [],
    UInt64.fromUint(200000));

// Sign the Transaction with cosignatory Account (userManagementAdmin)
const signedTransaction = userManagementAdminAccount.sign(aggregateTransaction, networkGenerationHash);
console.log(signedTransaction.hash);


// Hash lock needed for Aggregate Boned
// Let User Management Admin pay the lock function
const hashLockTransaction = HashLockTransaction.create(
    Deadline.create(),
    new Mosaic(new MosaicId('46BE9BC0626F9B1A'), UInt64.fromUint(10000000)),
    UInt64.fromUint(480),
    signedTransaction,
    networkType,
    UInt64.fromUint(200000));

const signedHashLockTransaction = userManagementAdminAccount.sign(hashLockTransaction, networkGenerationHash);


// Read announce to Network
const transactionHttp = new TransactionHttp(endpoint);
const listener = new Listener(endpoint);

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