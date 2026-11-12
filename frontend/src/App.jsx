import { useState, useEffect } from "react";
import { ethers } from "ethers";
import contractData from "./contractData.json";
import "./App.css";

const HARDHAT_CHAIN_ID_HEX = "0x7a69"; // 31337
const HARDHAT_RPC_URL = "http://127.0.0.1:8545";

function App() {
  const [account, setAccount] = useState("");
  const [ethBalance, setEthBalance] = useState("");
  const [tokenBalance, setTokenBalance] = useState("");
  const [currentChainId, setCurrentChainId] = useState("");
  const [isAuthorVerified, setIsAuthorVerified] = useState(false);

  // Кампании
  const [campaigns, setCampaigns] = useState([]);
  const [totalCampaigns, setTotalCampaigns] = useState(0);

  // Формы
  const [goalEth, setGoalEth] = useState("5");
  const [durationDays, setDurationDays] = useState("7");
  const [pledgeAmounts, setPledgeAmounts] = useState({});

  // UI стейты
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState(""); // "info" | "success" | "error"

  const hasMetaMask = typeof window !== "undefined" && Boolean(window.ethereum);

  const getCrowdfundingContract = async (withSigner = false) => {
    if (!contractData.crowdfunding?.address) throw new Error("Контракт Crowdfunding не развернут");
    if (withSigner) {
      if (!window.ethereum) throw new Error("MetaMask не обнаружен");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      return new ethers.Contract(contractData.crowdfunding.address, contractData.crowdfunding.abi, signer);
    } else {
      const provider = window.ethereum
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
      return new ethers.Contract(contractData.crowdfunding.address, contractData.crowdfunding.abi, provider);
    }
  };

  const getAuthorRegistryContract = async () => {
    const provider = window.ethereum
      ? new ethers.BrowserProvider(window.ethereum)
      : new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
    return new ethers.Contract(contractData.authorRegistry.address, contractData.authorRegistry.abi, provider);
  };

  const getRewardTokenContract = async () => {
    const provider = window.ethereum
      ? new ethers.BrowserProvider(window.ethereum)
      : new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
    return new ethers.Contract(contractData.rewardToken.address, contractData.rewardToken.abi, provider);
  };

  const loadData = async (userAccount = account) => {
    try {
      const cfContract = await getCrowdfundingContract(false);
      const [campList, total] = await cfContract.getCampaigns(0, 10);
      setTotalCampaigns(Number(total));

      // Форматируем список
      const formatted = campList.map((c, index) => {
        const id = index + 1;
        const goal = ethers.formatEther(c.goal);
        const pledged = ethers.formatEther(c.totalPledged);
        const deadline = Number(c.deadline);
        const isEnded = Date.now() / 1000 >= deadline;
        const isSuccess = Number(c.totalPledged) >= Number(c.goal);

        let status = "Активна";
        if (c.claimed) status = "Средства выведены (Успех)";
        else if (isEnded && isSuccess) status = "Успешна (готов к выводу)";
        else if (isEnded && !isSuccess) status = "Провалена (доступен возврат)";

        return {
          id,
          author: c.author,
          goal,
          pledged,
          deadline,
          claimed: c.claimed,
          isEnded,
          isSuccess,
          status,
        };
      });

      setCampaigns(formatted);

      // Загрузка данных пользователя
      if (userAccount) {
        const tokenContract = await getRewardTokenContract();
        const tBal = await tokenContract.balanceOf(userAccount);
        setTokenBalance(ethers.formatEther(tBal));

        const regContract = await getAuthorRegistryContract();
        const verified = await regContract.isVerified(userAccount);
        setIsAuthorVerified(verified);

        const provider = new ethers.BrowserProvider(window.ethereum);
        const eBal = await provider.getBalance(userAccount);
        setEthBalance(ethers.formatEther(eBal));
      }
    } catch (err) {
      console.error("Ошибка загрузки данных:", err);
    }
  };

  const connectWallet = async () => {
    if (!hasMetaMask) {
      alert("Установите расширение MetaMask!");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const currentAcc = accounts[0];
      setAccount(currentAcc);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      setCurrentChainId(network.chainId.toString());

      setStatusType("success");
      setStatusMessage(`Кошелек подключен: ${currentAcc.slice(0, 6)}...${currentAcc.slice(-4)}`);

      await loadData(currentAcc);
    } catch (err) {
      setStatusType("error");
      setStatusMessage(err.message || "Ошибка подключения");
    }
  };

  const switchToHardhat = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: HARDHAT_CHAIN_ID_HEX }],
      });
      setStatusType("success");
      setStatusMessage("Переключено на Hardhat Localhost (31337)");
    } catch (e) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: HARDHAT_CHAIN_ID_HEX,
              chainName: "Hardhat Localhost",
              rpcUrls: [HARDHAT_RPC_URL],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            },
          ],
        });
      } catch (addErr) {
        setStatusType("error");
        setStatusMessage(addErr.message);
      }
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!isAuthorVerified) {
      setStatusType("error");
      setStatusMessage("Вы не являетесь верифицированным автором!");
      return;
    }
    try {
      setLoading(true);
      setStatusType("info");
      setStatusMessage("Создание кампании...");

      const cfContract = await getCrowdfundingContract(true);
      const goalWei = ethers.parseEther(goalEth);
      const durationSeconds = Math.floor(Number(durationDays) * 24 * 3600);

      const tx = await cfContract.createCampaign(goalWei, durationSeconds);
      setStatusMessage(`Транзакция отправлена: ${tx.hash}`);
      await tx.wait();

      setStatusType("success");
      setStatusMessage("Кампания успешно создана!");
      await loadData();
    } catch (err) {
      console.error(err);
      setStatusType("error");
      setStatusMessage(err.reason || err.shortMessage || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePledge = async (campaignId) => {
    const amountEth = pledgeAmounts[campaignId];
    if (!amountEth || Number(amountEth) <= 0) return;

    try {
      setLoading(true);
      setStatusType("info");
      setStatusMessage(`Внесение взноса в кампанию #${campaignId}...`);

      const cfContract = await getCrowdfundingContract(true);
      const tx = await cfContract.pledge(campaignId, { value: ethers.parseEther(amountEth) });
      setStatusMessage(`Транзакция взноса: ${tx.hash}`);
      await tx.wait();

      setStatusType("success");
      setStatusMessage(`Взнос успешно внесен! Вам начислены токены RewardToken.`);
      setPledgeAmounts((prev) => ({ ...prev, [campaignId]: "" }));
      await loadData();
    } catch (err) {
      console.error(err);
      setStatusType("error");
      setStatusMessage(err.reason || err.shortMessage || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (campaignId) => {
    try {
      setLoading(true);
      setStatusType("info");
      setStatusMessage(`Вывод собранных средств автором для кампании #${campaignId}...`);

      const cfContract = await getCrowdfundingContract(true);
      const tx = await cfContract.claim(campaignId);
      await tx.wait();

      setStatusType("success");
      setStatusMessage(`Средства успешно выведены!`);
      await loadData();
    } catch (err) {
      console.error(err);
      setStatusType("error");
      setStatusMessage(err.reason || err.shortMessage || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefund = async (campaignId) => {
    try {
      setLoading(true);
      setStatusType("info");
      setStatusMessage(`Запрос возврата средств (Pull) для кампании #${campaignId}...`);

      const cfContract = await getCrowdfundingContract(true);
      const tx = await cfContract.claimRefund(campaignId);
      await tx.wait();

      setStatusType("success");
      setStatusMessage(`Возврат средств успешно выполнен!`);
      await loadData();
    } catch (err) {
      console.error(err);
      setStatusType("error");
      setStatusMessage(err.reason || err.shortMessage || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (hasMetaMask) {
      window.ethereum.on("accountsChanged", (accs) => {
        if (accs.length > 0) {
          setAccount(accs[0]);
          loadData(accs[0]);
        } else {
          setAccount("");
        }
      });
      window.ethereum.on("chainChanged", () => window.location.reload());
    }
  }, []);

  return (
    <div className="container">
      <header className="header">
        <div className="title-area">
          <h1>🚀 Crowdfunding dApp Platform</h1>
          <p className="subtitle">OpenZeppelin • Pull over Push • Checks-Effects-Interactions (CEI)</p>
        </div>

        <div className="wallet-actions">
          {!account ? (
            <button className="btn btn-primary" onClick={connectWallet}>
              Подключить MetaMask
            </button>
          ) : (
            <div className="wallet-badge">
              <span className="dot online"></span>
              <span>{account.slice(0, 6)}...{account.slice(-4)}</span>
              {ethBalance && <span className="balance">{parseFloat(ethBalance).toFixed(3)} ETH</span>}
              {tokenBalance && <span className="token-balance">🪙 {parseFloat(tokenBalance).toFixed(1)} CRT</span>}
              <span className={`status-tag ${isAuthorVerified ? "tag-yes" : "tag-no"}`}>
                {isAuthorVerified ? "Автор ✓" : "Вкладчик"}
              </span>
            </div>
          )}
        </div>
      </header>

      {statusMessage && (
        <div className={`notification ${statusType}`}>
          <span>{statusMessage}</span>
          <button className="close-btn" onClick={() => setStatusMessage("")}>✕</button>
        </div>
      )}

      {account && currentChainId !== "31337" && (
        <div className="network-warning">
          <span>⚠️ Вы подключены к Chain ID {currentChainId}. Переключитесь на Hardhat Localhost (31337).</span>
          <button className="btn btn-warning" onClick={switchToHardhat}>
            Переключить сеть на Localhost (31337)
          </button>
        </div>
      )}

      <main>
        {/* Форма создания кампании для верифицированных авторов */}
        {isAuthorVerified && (
          <div className="card mb-4">
            <h2>➕ Создать новую кампанию (Только для верифицированных авторов)</h2>
            <form onSubmit={handleCreateCampaign} className="create-form">
              <div className="form-group">
                <label>Цель сбора (ETH):</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={goalEth}
                  onChange={(e) => setGoalEth(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-group">
                <label>Длительность (в днях):</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  disabled={loading}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Создание..." : "Создать кампанию"}
              </button>
            </form>
          </div>
        )}

        {/* Список кампаний */}
        <div className="campaigns-header">
          <h2>📋 Список кампаний ({totalCampaigns})</h2>
          <button className="btn btn-secondary" onClick={() => loadData()}>🔄 Обновить</button>
        </div>

        {campaigns.length === 0 ? (
          <div className="card">Пока нет созданных кампаний.</div>
        ) : (
          <div className="grid">
            {campaigns.map((c) => {
              const isAuthor = account && c.author.toLowerCase() === account.toLowerCase();
              return (
                <div key={c.id} className="card campaign-card">
                  <div className="card-top">
                    <h3>Кампания #{c.id}</h3>
                    <span className={`status-pill ${c.isSuccess ? "pill-success" : c.isEnded ? "pill-failed" : "pill-active"}`}>
                      {c.status}
                    </span>
                  </div>

                  <div className="data-row">
                    <span className="label">Автор:</span>
                    <code className="value">{c.author}</code>
                  </div>

                  <div className="progress-section">
                    <div className="progress-labels">
                      <span>Собрано: <strong>{c.pledged} ETH</strong></span>
                      <span>Цель: <strong>{c.goal} ETH</strong></span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min(100, (Number(c.pledged) / Number(c.goal)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="data-row mt-2">
                    <span className="label">Окончание:</span>
                    <span className="text-muted">{new Date(c.deadline * 1000).toLocaleString()}</span>
                  </div>

                  {/* Действия с кампанией */}
                  <div className="action-box mt-3">
                    {!c.isEnded && (
                      <div className="pledge-form">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Сумма ETH"
                          value={pledgeAmounts[c.id] || ""}
                          onChange={(e) => setPledgeAmounts({ ...pledgeAmounts, [c.id]: e.target.value })}
                          disabled={loading || !account}
                        />
                        <button
                          className="btn btn-primary"
                          onClick={() => handlePledge(c.id)}
                          disabled={loading || !account || !pledgeAmounts[c.id]}
                        >
                          Внести ETH
                        </button>
                      </div>
                    )}

                    {c.isEnded && c.isSuccess && !c.claimed && isAuthor && (
                      <button className="btn btn-success w-full" onClick={() => handleClaim(c.id)} disabled={loading}>
                        💰 Вывести средства (Claim)
                      </button>
                    )}

                    {c.isEnded && !c.isSuccess && (
                      <button className="btn btn-warning w-full" onClick={() => handleRefund(c.id)} disabled={loading || !account}>
                        ↩️ Забрать свой вклад (Refund Pull)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="footer mt-4">
        <div className="quick-commands">
          <h4>🔐 Архитектурная модель безопасности:</h4>
          <ul>
            <li><strong>Pull over Push:</strong> Каждый вкладчик самостоятельно инициирует возврат средств.</li>
            <li><strong>Checks-Effects-Interactions (CEI):</strong> Баланс вклада обнуляется ДО внешнего вызова низкого уровня <code>call</code>.</li>
            <li><strong>Эмиссия RewardToken:</strong> Токены наград выпускаются контрактом Crowdfunding в соотношении 1 ETH = 1 CRT.</li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

export default App;
