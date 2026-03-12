import { PublicKey } from "@solana/web3.js";
import { connection, GOVERNANCE, TOKEN } from "../shared/config.js";
import { getMemberProfile } from "../soul/member-ledger.js";

export interface VoterEligibility {
  walletAddress: string;
  balance: number;
  mintAddress: string;
}

function parseTokenBalance(account: any): number {
  const tokenAmount = account?.account?.data?.parsed?.info?.tokenAmount;
  if (!tokenAmount) return 0;
  if (typeof tokenAmount.uiAmount === "number") {
    return tokenAmount.uiAmount;
  }

  const rawAmount = Number(tokenAmount.amount ?? 0);
  const decimals = Number(tokenAmount.decimals ?? 0);
  if (!Number.isFinite(rawAmount) || !Number.isFinite(decimals)) return 0;
  return rawAmount / (10 ** decimals);
}

export async function assertMemberCanVote(userId: string): Promise<VoterEligibility> {
  if (!GOVERNANCE.enforceTokenHolder) {
    return {
      walletAddress: "",
      balance: 0,
      mintAddress: "",
    };
  }

  if (!GOVERNANCE.tokenMintAddress.trim()) {
    throw new Error("RHC_MINT_ADDRESS is not configured. Token-holder voting cannot be verified yet.");
  }

  const profile = getMemberProfile(userId);
  if (!profile?.walletAddress) {
    throw new Error("No wallet registered. Use /wallet <solana-address> before voting.");
  }

  let owner: PublicKey;
  let mint: PublicKey;
  try {
    owner = new PublicKey(profile.walletAddress);
    mint = new PublicKey(GOVERNANCE.tokenMintAddress);
  } catch {
    throw new Error("Stored wallet or RHC mint address is not a valid Solana public key.");
  }

  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed");
  const balance = accounts.value.reduce((sum, account) => sum + parseTokenBalance(account), 0);

  if (balance < GOVERNANCE.minTokenBalance) {
    throw new Error(
      `Wallet ${profile.walletAddress} does not hold enough ${TOKEN.symbol} to vote. ` +
      `Required: ${GOVERNANCE.minTokenBalance}.`,
    );
  }

  return {
    walletAddress: profile.walletAddress,
    balance,
    mintAddress: GOVERNANCE.tokenMintAddress,
  };
}
