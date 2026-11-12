const { ethers, artifacts } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "Не знайдено підписанта (акаунта) для розгортання. Перевірте PRIVATE_KEY у файлі .env!"
    );
  }

  const deployer = signers[0];
  const author = signers.length > 1 ? signers[1] : null;

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const isSepolia = chainId === 11155111;

  console.log("====================================================");
  console.log("       РОЗГОРТАННЯ СИСТЕМИ КРАУДФАНДИНГУ            ");
  console.log("====================================================");
  console.log("Мережа:            ", network.name, `(Chain ID: ${chainId})`);
  console.log("Адреса деплоєра:   ", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Баланс деплоєра:   ", ethers.formatEther(balance), "ETH");
  console.log("====================================================");

  if (balance === 0n) {
    console.warn("⚠️ УВАГА: Баланс деплоєра 0 ETH! Отримайте тестовий ETH через фаусет перед деплоєм.");
  }

  // 1. Деплой AuthorRegistry
  console.log("\n[1/4] Розгортання AuthorRegistry...");
  const AuthorRegistry = await ethers.getContractFactory("AuthorRegistry");
  const authorRegistry = await AuthorRegistry.deploy(deployer.address);
  await authorRegistry.waitForDeployment();
  const authorRegistryAddress = await authorRegistry.getAddress();
  console.log("✓ AuthorRegistry:", authorRegistryAddress);

  // 2. Деплой RewardToken
  console.log("\n[2/4] Розгортання RewardToken...");
  const RewardToken = await ethers.getContractFactory("RewardToken");
  const rewardToken = await RewardToken.deploy(deployer.address);
  await rewardToken.waitForDeployment();
  const rewardTokenAddress = await rewardToken.getAddress();
  console.log("✓ RewardToken:", rewardTokenAddress);

  // 3. Деплой Crowdfunding
  console.log("\n[3/4] Розгортання Crowdfunding...");
  const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
  const crowdfunding = await Crowdfunding.deploy(
    authorRegistryAddress,
    rewardTokenAddress,
    deployer.address
  );
  await crowdfunding.waitForDeployment();
  const crowdfundingAddress = await crowdfunding.getAddress();
  console.log("✓ Crowdfunding:", crowdfundingAddress);

  // 4. Передача прав володіння токеном платформі Crowdfunding
  console.log("\n[4/4] Налаштування зв'язків між контрактами...");
  const txOwnership = await rewardToken.transferOwnership(crowdfundingAddress);
  await txOwnership.wait();
  console.log("✓ Права володіння RewardToken передано Crowdfunding.");

  // 5. Верифікація деплоєра та другого акаунта (якщо є) як авторів
  console.log("\nВерифікація авторів в AuthorRegistry...");
  const txAddDeployer = await authorRegistry.addAuthor(deployer.address);
  await txAddDeployer.wait();
  console.log(`✓ Деплоєра (${deployer.address}) верифіковано як автора.`);

  if (author && author.address.toLowerCase() !== deployer.address.toLowerCase()) {
    const txAddAuthor = await authorRegistry.addAuthor(author.address);
    await txAddAuthor.wait();
    console.log(`✓ Другий акаунт (${author.address}) також верифіковано як автора.`);
  }

  // 6. Створення початкової демо-кампанії
  console.log("\nСтворення початкової демонстраційної кампанії...");
  // Для Sepolia встановлюємо маленьку мету (0.005 ETH) та тривалість 1 годину (3600 сек)
  const goal = isSepolia ? ethers.parseEther("0.005") : ethers.parseEther("5");
  const duration = isSepolia ? 3600 : 7 * 24 * 3600;

  const createTx = await crowdfunding.createCampaign(goal, duration);
  await createTx.wait();
  console.log(
    `✓ Демо-кампанія #1 створена! Ціль: ${ethers.formatEther(goal)} ETH, Тривалість: ${duration} сек.`
  );

  // 7. Збереження результатів у файли
  const resultData = {
    network: {
      chainId: chainId,
      name: network.name,
    },
    contracts: {
      Crowdfunding: crowdfundingAddress,
      AuthorRegistry: authorRegistryAddress,
      RewardToken: rewardTokenAddress,
    },
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(__dirname, "..", "deployedAddresses.json"),
    JSON.stringify(resultData, null, 2)
  );

  // Збереження даних разом з ABI для фронтенду
  const frontendDir = path.join(__dirname, "..", "frontend", "src");
  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
  }

  const crowdfundingArtifact = await artifacts.readArtifact("Crowdfunding");
  const rewardTokenArtifact = await artifacts.readArtifact("RewardToken");
  const authorRegistryArtifact = await artifacts.readArtifact("AuthorRegistry");

  const contractData = {
    crowdfunding: {
      address: crowdfundingAddress,
      abi: crowdfundingArtifact.abi,
    },
    rewardToken: {
      address: rewardTokenAddress,
      abi: rewardTokenArtifact.abi,
    },
    authorRegistry: {
      address: authorRegistryAddress,
      abi: authorRegistryArtifact.abi,
    },
    network: {
      chainId: chainId,
      name: network.name,
    },
  };

  fs.writeFileSync(
    path.join(frontendDir, "contractData.json"),
    JSON.stringify(contractData, null, 2)
  );

  console.log("\n====================================================");
  console.log("            РОЗГОРТАННЯ УСПІШНО ЗАВЕРШЕНО           ");
  console.log("====================================================");
  console.log("AuthorRegistry: ", authorRegistryAddress);
  console.log("RewardToken:    ", rewardTokenAddress);
  console.log("Crowdfunding:   ", crowdfundingAddress);
  if (isSepolia) {
    console.log("\nEtherscan посилання:");
    console.log(`Crowdfunding:   https://sepolia.etherscan.io/address/${crowdfundingAddress}`);
    console.log(`AuthorRegistry: https://sepolia.etherscan.io/address/${authorRegistryAddress}`);
    console.log(`RewardToken:    https://sepolia.etherscan.io/address/${rewardTokenAddress}`);
    console.log("\nКоманда верифікації коду на Etherscan:");
    console.log(
      `npx hardhat verify --network sepolia ${crowdfundingAddress} "${authorRegistryAddress}" "${rewardTokenAddress}" "${deployer.address}"`
    );
  }
  console.log("====================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Помилка деплою:", error);
    process.exit(1);
  });
