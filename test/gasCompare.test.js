const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Порівняння витрат газу: Crowdfunding vs CrowdfundingOptimized", function () {
  let admin, author, contributor;
  let authorRegistry;
  let rewardToken1, rewardToken2;
  let crowdfundingOriginal, crowdfundingOptimized;

  const ONE_DAY = 24 * 60 * 60;
  const GOAL = ethers.parseEther("10");
  const PLEDGE_AMOUNT = ethers.parseEther("2");

  beforeEach(async function () {
    [admin, author, contributor] = await ethers.getSigners();

    // 1. AuthorRegistry
    const AuthorRegistry = await ethers.getContractFactory("AuthorRegistry");
    authorRegistry = await AuthorRegistry.deploy(admin.address);
    await authorRegistry.waitForDeployment();
    await authorRegistry.connect(admin).addAuthor(author.address);

    const RewardToken = await ethers.getContractFactory("RewardToken");

    // 2. Crowdfunding (Базова версія)
    rewardToken1 = await RewardToken.deploy(admin.address);
    await rewardToken1.waitForDeployment();

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
    crowdfundingOriginal = await Crowdfunding.deploy(
      await authorRegistry.getAddress(),
      await rewardToken1.getAddress(),
      admin.address
    );
    await crowdfundingOriginal.waitForDeployment();
    await rewardToken1.connect(admin).transferOwnership(await crowdfundingOriginal.getAddress());

    // 3. CrowdfundingOptimized (Оптимізована версія)
    rewardToken2 = await RewardToken.deploy(admin.address);
    await rewardToken2.waitForDeployment();

    const CrowdfundingOptimized = await ethers.getContractFactory("CrowdfundingOptimized");
    crowdfundingOptimized = await CrowdfundingOptimized.deploy(
      await authorRegistry.getAddress(),
      await rewardToken2.getAddress(),
      admin.address
    );
    await crowdfundingOptimized.waitForDeployment();
    await rewardToken2.connect(admin).transferOwnership(await crowdfundingOptimized.getAddress());
  });

  it("Виконує ідентичні дії та виводить порівняльну таблицю газу «До і Після»", async function () {
    // --- 1. ДЕПЛОЙ ---
    const deployTxOriginal = crowdfundingOriginal.deploymentTransaction();
    const deployReceiptOriginal = await deployTxOriginal.wait();
    const gasDeployOriginal = deployReceiptOriginal.gasUsed;

    const deployTxOptimized = crowdfundingOptimized.deploymentTransaction();
    const deployReceiptOptimized = await deployTxOptimized.wait();
    const gasDeployOptimized = deployReceiptOptimized.gasUsed;

    // --- 2. СТВОРЕННЯ КАМПАНІЇ (createCampaign) ---
    const txCreateOrig = await crowdfundingOriginal.connect(author).createCampaign(GOAL, 7 * ONE_DAY);
    const receiptCreateOrig = await txCreateOrig.wait();
    const gasCreateOrig = receiptCreateOrig.gasUsed;

    const txCreateOpt = await crowdfundingOptimized.connect(author).createCampaign(GOAL, 7 * ONE_DAY);
    const receiptCreateOpt = await txCreateOpt.wait();
    const gasCreateOpt = receiptCreateOpt.gasUsed;

    // --- 3. ВНЕСОК КОШТІВ (pledge) ---
    const txPledgeOrig = await crowdfundingOriginal.connect(contributor).pledge(1, { value: PLEDGE_AMOUNT });
    const receiptPledgeOrig = await txPledgeOrig.wait();
    const gasPledgeOrig = receiptPledgeOrig.gasUsed;

    const txPledgeOpt = await crowdfundingOptimized.connect(contributor).pledge(1, { value: PLEDGE_AMOUNT });
    const receiptPledgeOpt = await txPledgeOpt.wait();
    const gasPledgeOpt = receiptPledgeOpt.gasUsed;

    // Зсуваємо час за дедлайн, щоб кампанія завершилася провалом (для тесту повернення)
    await time.increase(8 * ONE_DAY);

    // --- 4. ПОВЕРНЕННЯ КОШТІВ (claimRefund) ---
    const txRefundOrig = await crowdfundingOriginal.connect(contributor).claimRefund(1);
    const receiptRefundOrig = await txRefundOrig.wait();
    const gasRefundOrig = receiptRefundOrig.gasUsed;

    const txRefundOpt = await crowdfundingOptimized.connect(contributor).claimRefund(1);
    const receiptRefundOpt = await txRefundOpt.wait();
    const gasRefundOpt = receiptRefundOpt.gasUsed;

    // --- ФОРМУВАННЯ ТАБЛИЦІ РЕЗУЛЬТАТІВ ---
    const results = [
      {
        "Операція / Функція": "Деплой контракту (Deployment)",
        "Crowdfunding (До)": Number(gasDeployOriginal).toLocaleString() + " gas",
        "CrowdfundingOptimized (Після)": Number(gasDeployOptimized).toLocaleString() + " gas",
        "Економія (абс.)": Number(gasDeployOriginal - gasDeployOptimized).toLocaleString() + " gas",
        "Економія (%)": (((Number(gasDeployOriginal) - Number(gasDeployOptimized)) / Number(gasDeployOriginal)) * 100).toFixed(2) + " %"
      },
      {
        "Операція / Функція": "createCampaign() [Storage Packing]",
        "Crowdfunding (До)": Number(gasCreateOrig).toLocaleString() + " gas",
        "CrowdfundingOptimized (Після)": Number(gasCreateOpt).toLocaleString() + " gas",
        "Економія (абс.)": Number(gasCreateOrig - gasCreateOpt).toLocaleString() + " gas",
        "Економія (%)": (((Number(gasCreateOrig) - Number(gasCreateOpt)) / Number(gasCreateOrig)) * 100).toFixed(2) + " %"
      },
      {
        "Операція / Функція": "pledge() [Unchecked + Packing]",
        "Crowdfunding (До)": Number(gasPledgeOrig).toLocaleString() + " gas",
        "CrowdfundingOptimized (Після)": Number(gasPledgeOpt).toLocaleString() + " gas",
        "Економія (абс.)": Number(gasPledgeOrig - gasPledgeOpt).toLocaleString() + " gas",
        "Економія (%)": (((Number(gasPledgeOrig) - Number(gasPledgeOpt)) / Number(gasPledgeOrig)) * 100).toFixed(2) + " %"
      },
      {
        "Операція / Функція": "claimRefund() [Pull + CEI]",
        "Crowdfunding (До)": Number(gasRefundOrig).toLocaleString() + " gas",
        "CrowdfundingOptimized (Після)": Number(gasRefundOpt).toLocaleString() + " gas",
        "Економія (абс.)": Number(gasRefundOrig - gasRefundOpt).toLocaleString() + " gas",
        "Економія (%)": (((Number(gasRefundOrig) - Number(gasRefundOpt)) / Number(gasRefundOrig)) * 100).toFixed(2) + " %"
      }
    ];

    console.log("\n==========================================================================================");
    console.log("            ПОРІВНЯЛЬНА ТАБЛИЦЯ ВИТРАТ ГАЗУ «ДО І ПІСЛЯ» ОПТИМІЗАЦІЇ                      ");
    console.log("==========================================================================================");
    console.table(results);
    console.log("==========================================================================================\n");

    // Перевіряємо, що оптимізована версія дійсно витрачає менше газу на createCampaign
    expect(gasCreateOpt).to.be.lessThan(gasCreateOrig);
  });
});
