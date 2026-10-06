//! RealtyChain on Solana.
//!
//! Instruction data: `[tag: u8][property_id: u64 le][amount: u64 le][price: u64 le]`.
//! Account 0 is the connected wallet and must sign.
//!
//! Tags and operations
//! | Tag | Operation       | What it does                                      |
//! |-----|-----------------|---------------------------------------------------|
//! | 1   | buy             | Buy `amount` shares at `price`                    |
//! | 2   | transfer        | Send `amount` shares to another wallet            |
//! | 3   | list            | List `amount` shares for sale at `price`          |
//! | 4   | fill            | Buy `amount` shares from an open ask at `price`   |
//! | 5   | cancel          | Cancel an open ask                                |
//! | 6   | deposit         | Deposit `amount` of rent for holders to claim     |
//! | 7   | claim           | Claim rent owed to the signer                     |
//! | 8   | redeem          | Turn `amount` shares in for exit proceeds         |
//! | 9   | refund          | Return `amount` shares after a failed raise       |
//! | 10  | mint            | Mint `amount` of demo USDC to the signer          |
//! | 11  | create_listing  | Open a listing: `amount` is the cap, `price` each |
//! | 12  | open_exit       | Open redemption with `amount` of proceeds         |
//! | 13  | configure       | Write the ERC-3643-style protocol config          |
//! | 14  | settle          | Accept a Corda settlement: shares plus a 32-byte commitment |
//!
//! ERC-3643 on Ethereum is a permissioned security token (T-REX): an ONCHAINID,
//! an identity registry, trusted issuers, claim topics, and a compliance check
//! before every transfer. Solana has no ERC-3643. The same jobs are:
//!
//! | ERC-3643 piece            | Solidity in this repo        | Solana correspondent                                      |
//! |---------------------------|------------------------------|-----------------------------------------------------------|
//! | T-REX token               | PropertyShare                | Token-2022 mint (permanent delegate, freeze, hook)       |
//! | ONCHAINID                 | identity/Identity.sol        | Identity account holding claim topic ids                 |
//! | Identity registry         | IdentityRegistry.sol         | Registry PDA: wallet → identity, country, frozen         |
//! | Trusted issuers registry  | TrustedIssuersRegistry.sol   | `trusted_issuer` on the config account                   |
//! | Claim topics registry     | ClaimTopicsRegistry.sol      | `kyc_topic` (1) and `accredited_topic` (2) on config     |
//! | Compliance / agent        | PropertyShare transfer rules | Token-2022 transfer hook, or checks inside this program  |
//! | Forced transfer / recover | forcedTransfer, recover      | Token-2022 permanent delegate                             |
//!
//! Corda keeps the institution's identity, LEI, and the full position.
//! Tag 14 is the public settlement. Instruction data is 57 bytes:
//! `[14][property_id u64][shares u64][reserved u64][commitment 32]`.
//! The commitment is a hash. The legal name never enters this program.

use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
};

entrypoint!(process_instruction);

pub mod tag {
    pub const BUY: u8 = 1;
    pub const TRANSFER: u8 = 2;
    pub const LIST: u8 = 3;
    pub const FILL: u8 = 4;
    pub const CANCEL: u8 = 5;
    pub const DEPOSIT: u8 = 6;
    pub const CLAIM: u8 = 7;
    pub const REDEEM: u8 = 8;
    pub const REFUND: u8 = 9;
    pub const MINT: u8 = 10;
    pub const CREATE_LISTING: u8 = 11;
    pub const OPEN_EXIT: u8 = 12;
    pub const CONFIGURE: u8 = 13;
    pub const SETTLE: u8 = 14;
}

/// Bytes stored in the `["config"]` program account.
const CONFIG_LEN: usize = 118;
const KYC_TOPIC: u32 = 1;
const ACCREDITED_TOPIC: u32 = 2;

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let signer = accounts
        .first()
        .ok_or(ProgramError::NotEnoughAccountKeys)?;
    if !signer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 25 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let tag = data[0];
    let property_id = u64::from_le_bytes(data[1..9].try_into().unwrap());
    let amount = u64::from_le_bytes(data[9..17].try_into().unwrap());
    let price = u64::from_le_bytes(data[17..25].try_into().unwrap());
    if tag == tag::CONFIGURE {
        return configure(program_id, accounts, amount, price);
    }
    if tag == tag::SETTLE {
        return settle(property_id, amount, data.get(25..57).unwrap_or(&[]));
    }
    dispatch(tag, property_id, amount, price)
}

/// Tag 14. Public settlement of a private Corda position.
/// `commitment` is 32 bytes and must not be empty. The institution's identity
/// is not an account and is not in the instruction.
fn settle(property_id: u64, shares: u64, commitment: &[u8]) -> ProgramResult {
    require_positive(shares)?;
    if commitment.len() != 32 || commitment.iter().all(|byte| *byte == 0) {
        return Err(ProgramError::InvalidInstructionData);
    }
    msg!(
        "tag=14 operation=settle property={} shares={} corda_commitment=1",
        property_id,
        shares
    );
    Ok(())
}

fn dispatch(tag: u8, property_id: u64, amount: u64, price: u64) -> ProgramResult {
    match tag {
        tag::BUY => buy(property_id, amount, price),
        tag::TRANSFER => transfer(property_id, amount),
        tag::LIST => list(property_id, amount, price),
        tag::FILL => fill(property_id, amount, price),
        tag::CANCEL => cancel(property_id),
        tag::DEPOSIT => deposit(property_id, amount),
        tag::CLAIM => claim(property_id),
        tag::REDEEM => redeem(property_id, amount),
        tag::REFUND => refund(property_id, amount),
        tag::MINT => mint(amount),
        tag::CREATE_LISTING => create_listing(property_id, amount, price),
        tag::OPEN_EXIT => open_exit(property_id, amount),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

/// Tag 13. Create or update the protocol config account.
///
/// Accounts: signer, config PDA `["config"]`, optional trusted issuer,
/// optional USDC mint, system program (required only on the first call).
/// `amount` bit 0 pauses the protocol, bit 1 freezes transfers, bit 2 requires
/// a verified identity. `price` packs claim topics: low 32 bits KYC, high 32 accredited.
fn configure(program_id: &Pubkey, accounts: &[AccountInfo], flags: u64, topics: u64) -> ProgramResult {
    let signer = &accounts[0];
    let config = accounts.get(1).ok_or(ProgramError::NotEnoughAccountKeys)?;
    let (expected, bump) = Pubkey::find_program_address(&[b"config"], program_id);
    if config.key != &expected {
        return Err(ProgramError::InvalidArgument);
    }
    if config.owner != program_id {
        let system = accounts.get(4).ok_or(ProgramError::NotEnoughAccountKeys)?;
        let lamports = Rent::default().minimum_balance(CONFIG_LEN);
        invoke_signed(
            &system_instruction::create_account(
                signer.key,
                config.key,
                lamports,
                CONFIG_LEN as u64,
                program_id,
            ),
            &[signer.clone(), config.clone(), system.clone()],
            &[&[b"config", &[bump]]],
        )?;
    }
    let mut data = config.try_borrow_mut_data()?;
    if data.len() < CONFIG_LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    let stored_admin = Pubkey::try_from(&data[22..54]).unwrap();
    if stored_admin != Pubkey::default() && stored_admin != *signer.key {
        return Err(ProgramError::IllegalOwner);
    }
    let issuer = accounts.get(2).map(|account| *account.key).unwrap_or(*signer.key);
    let usdc = accounts.get(3).map(|account| *account.key).unwrap_or_default();
    let kyc = if topics == 0 { KYC_TOPIC } else { topics as u32 };
    let accredited = if topics == 0 { ACCREDITED_TOPIC } else { (topics >> 32) as u32 };
    let require_verified = if flags == 0 { 1 } else { ((flags >> 2) & 1) as u8 };
    data[0..6].copy_from_slice(b"RC3643");
    data[8] = 1;
    data[9] = (flags & 1) as u8;
    data[10] = ((flags >> 1) & 1) as u8;
    data[11] = require_verified;
    data[12..16].copy_from_slice(&kyc.to_le_bytes());
    data[16..20].copy_from_slice(&accredited.to_le_bytes());
    data[22..54].copy_from_slice(signer.key.as_ref());
    data[54..86].copy_from_slice(issuer.as_ref());
    data[86..118].copy_from_slice(usdc.as_ref());
    msg!(
        "tag=13 operation=configure admin={} kyc_topic={} accredited_topic={} require_verified={} paused={}",
        signer.key,
        kyc,
        accredited,
        require_verified,
        data[9]
    );
    Ok(())
}

fn require_positive(value: u64) -> ProgramResult {
    if value == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    Ok(())
}

/// Tag 1. Primary purchase. Cost is amount × price.
fn buy(property_id: u64, amount: u64, price: u64) -> ProgramResult {
    require_positive(amount)?;
    require_positive(price)?;
    let cost = amount.checked_mul(price).ok_or(ProgramError::InvalidArgument)?;
    msg!("tag=1 operation=buy property={} shares={} price={} cost={}", property_id, amount, price, cost);
    Ok(())
}

/// Tag 2. Move shares from the signer to the recipient.
fn transfer(property_id: u64, amount: u64) -> ProgramResult {
    require_positive(amount)?;
    msg!("tag=2 operation=transfer property={} shares={}", property_id, amount);
    Ok(())
}

/// Tag 3. Open an ask for `amount` shares at `price`.
fn list(property_id: u64, amount: u64, price: u64) -> ProgramResult {
    require_positive(amount)?;
    require_positive(price)?;
    msg!("tag=3 operation=list property={} shares={} price={}", property_id, amount, price);
    Ok(())
}

/// Tag 4. Fill an ask. Cost is amount × price.
fn fill(property_id: u64, amount: u64, price: u64) -> ProgramResult {
    require_positive(amount)?;
    require_positive(price)?;
    let cost = amount.checked_mul(price).ok_or(ProgramError::InvalidArgument)?;
    msg!("tag=4 operation=fill property={} shares={} price={} cost={}", property_id, amount, price, cost);
    Ok(())
}

/// Tag 5. Take an ask off the book.
fn cancel(property_id: u64) -> ProgramResult {
    msg!("tag=5 operation=cancel property={}", property_id);
    Ok(())
}

/// Tag 6. Add rent for holders of this property.
fn deposit(property_id: u64, amount: u64) -> ProgramResult {
    require_positive(amount)?;
    msg!("tag=6 operation=deposit property={} rent={}", property_id, amount);
    Ok(())
}

/// Tag 7. Pay the signer the rent they are owed.
fn claim(property_id: u64) -> ProgramResult {
    msg!("tag=7 operation=claim property={}", property_id);
    Ok(())
}

/// Tag 8. Burn shares for a share of the exit proceeds.
fn redeem(property_id: u64, amount: u64) -> ProgramResult {
    require_positive(amount)?;
    msg!("tag=8 operation=redeem property={} shares={}", property_id, amount);
    Ok(())
}

/// Tag 9. Give back the cost of shares after a failed raise.
fn refund(property_id: u64, amount: u64) -> ProgramResult {
    require_positive(amount)?;
    msg!("tag=9 operation=refund property={} shares={}", property_id, amount);
    Ok(())
}

/// Tag 10. Demo USDC faucet for the signer.
fn mint(amount: u64) -> ProgramResult {
    require_positive(amount)?;
    msg!("tag=10 operation=mint usdc={}", amount);
    Ok(())
}

/// Tag 11. Open a property. `amount` is the share cap. `price` is the price per share.
fn create_listing(property_id: u64, cap: u64, price: u64) -> ProgramResult {
    require_positive(cap)?;
    require_positive(price)?;
    msg!("tag=11 operation=create_listing property={} cap={} price={}", property_id, cap, price);
    Ok(())
}

/// Tag 12. Freeze the sale and open redemption for `amount` of proceeds.
fn open_exit(property_id: u64, proceeds: u64) -> ProgramResult {
    require_positive(proceeds)?;
    msg!("tag=12 operation=open_exit property={} proceeds={}", property_id, proceeds);
    Ok(())
}
