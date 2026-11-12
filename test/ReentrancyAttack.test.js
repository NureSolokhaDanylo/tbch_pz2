const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ПУНКТ 4: Навчальна атака Reentrancy (Vulnerable vs Secure)", function () {
  let admin, author, victim1, victim2, attackerSigner;
  let authorRegistry;
  let rewardTokenVuln, rewardTokenSec;
  let crowdfundingVulnerable, crowdfundingSecure;
  let attackerAgainstVulnerable, attackerAgainstSecure;

  const ONE_DAY = 24 * 60 * 60;
  const GOAL = ethers.parseEther("10"); // 10 ETH

  beforeEach(async function () {
    [admin, author, victim1, victim2, attackerSigner] = await ethers.getSigners();

    // 1. AuthorRegistry
    const AuthorRegistry = await ethers.getContractFactory("AuthorRegistry");
    authorRegistry = await AuthorRegistry.deploy(admin.address);
    await authorRegistry.waitForDeployment();
    await authorRegistry.connect(admin).addAuthor(author.address);

    const RewardToken = await ethers.getContractFactory("RewardToken");

    // 2. Сетап вразливого контракту
    rewardTokenVuln = await RewardToken.deploy(admin.address);
    await rewardTokenVuln.waitForDeployment();

    const CrowdfundingVulnerable = await ethers.getContractFactory("CrowdfundingVulnerable");
    crowdfundingVulnerable = await CrowdfundingVulnerable.deploy(
      await authorRegistry.getAddress(),
      await rewardTokenVuln.getAddress(),
      admin.address
    );
    await crowdfundingVulnerable.waitForDeployment();
    await rewardTokenVuln.connect(admin).transferOwnership(await crowdfundingVulnerable.getAddress());

    // 3. Сетап захищеного контракту
    rewardTokenSec = await RewardToken.deploy(admin.address);
    await rewardTokenSec.waitForDeployment();

    const CrowdfundingSecure = await ethers.getContractFactory("Crowdfunding");
    crowdfundingSecure = await CrowdfundingSecure.deploy(
      await authorRegistry.getAddress(),
      await rewardTokenSec.getAddress(),
      admin.address
    );
    await crowdfundingSecure.waitForDeployment();
    await rewardTokenSec.connect(admin).transferOwnership(await crowdfundingSecure.getAddress());

    // 4. Контракти атакувальника
    const AttackerFactory = await ethers.getContractFactory("Attacker");

    // Атакувальник для вразливого контракту (isVulnerable = true)
    attackerAgainstVulnerable = await AttackerFactory.connect(attackerSigner).deploy(
      await crowdfundingVulnerable.getAddress(),
      true
    );
    await attackerAgainstVulnerable.waitForDeployment();

    // Атакувальник для безпечного контракту (isVulnerable = false)
    attackerAgainstSecure = await AttackerFactory.connect(attackerSigner).deploy(
      await crowdfundingSecure.getAddress(),
      false
    );
    await attackerAgainstSecure.waitForDeployment();
  });

  it("Тест 1 (Успішна атака): Контракт-атакувальник атакує CrowdfundingVulnerable та успішно спустошує чужий ETH, баланс жертви стає 0", async function () {
    // Крок 1: Автор створює кампанію
    await crowdfundingVulnerable.connect(author).createCampaign(GOAL, 7 * ONE_DAY);

    // Крок 2: Чесні користувачі (жертви) вносять у сумі 4 ETH (2 ETH + 2 ETH)
    await crowdfundingVulnerable.connect(victim1).pledge(1, { value: ethers.parseEther("2") });
    await crowdfundingVulnerable.connect(victim2).pledge(1, { value: ethers.parseEther("2") });

    // Крок 3: Атакувальник вносить свій депозит 1 ETH
    await attackerAgainstVulnerable.connect(attackerSigner).deposit(1, { value: ethers.parseEther("1") });

    // Перевіряємо початковий баланс жертви: 2 + 2 + 1 = 5 ETH
    const vulnerableAddress = await crowdfundingVulnerable.getAddress();
    const attackerContractAddress = await attackerAgainstVulnerable.getAddress();

    expect(await ethers.provider.getBalance(vulnerableAddress)).to.equal(ethers.parseEther("5"));
    expect(await ethers.provider.getBalance(attackerContractAddress)).to.equal(0n);

    // Крок 4: Настає дедлайн, ціль 10 ETH не досягнута (провал збору)
    await time.increase(8 * ONE_DAY);

    // Крок 5: Атакувальник запускає експлойт
    console.log("    -> Запуск атаки на CrowdfundingVulnerable...");
    const tx = await attackerAgainstVulnerable.connect(attackerSigner).attack(1);
    await tx.wait();

    // Крок 6: Перевірка результатів атаки:
    // Баланс контракту жертви повністю спустошено (став рівно 0 ETH)!
    const victimBalanceAfter = await ethers.provider.getBalance(vulnerableAddress);
    expect(victimBalanceAfter).to.equal(0n);

    // Баланс контракту атакувальника склав 5 ETH (1 ETH свій + 4 ETH вкрадених коштів жертв!)
    const attackerBalanceAfter = await ethers.provider.getBalance(attackerContractAddress);
    expect(attackerBalanceAfter).to.equal(ethers.parseEther("5"));

    console.log(`    ✓ Баланс вразливого контракту спустошено: ${ethers.formatEther(victimBalanceAfter)} ETH`);
    console.log(`    ✓ Вкрадений баланс на контракті атакувальника: ${ethers.formatEther(attackerBalanceAfter)} ETH (вкрадено 4 ETH чужих вкладників)`);
  });

  it("Тест 2 (Відбита атака): Атакувальник намагається виконати ту ж процедуру проти безпечної версії Crowdfunding — транзакція скасовується (revert), атака зазнає невдачі", async function () {
    // Крок 1: Створюємо кампанію в безпечному контракті
    await crowdfundingSecure.connect(author).createCampaign(GOAL, 7 * ONE_DAY);

    // Крок 2: Чесні користувачі вносять 4 ETH
    await crowdfundingSecure.connect(victim1).pledge(1, { value: ethers.parseEther("2") });
    await crowdfundingSecure.connect(victim2).pledge(1, { value: ethers.parseEther("2") });

    // Крок 3: Атакувальник вносить свій депозит 1 ETH
    await attackerAgainstSecure.connect(attackerSigner).deposit(1, { value: ethers.parseEther("1") });

    const secureAddress = await crowdfundingSecure.getAddress();
    const attackerContractAddress = await attackerAgainstSecure.getAddress();

    expect(await ethers.provider.getBalance(secureAddress)).to.equal(ethers.parseEther("5"));

    // Крок 4: Настає дедлайн, кампанія провалена
    await time.increase(8 * ONE_DAY);

    // Крок 5: Атакувальник намагається виконати Reentrancy через attack()
    // При виклику receive() повторний claimRefund зустрічає contributions == 0
    // і генерує revert NoContribution(), що скасовує всю транзакцію атаки!
    console.log("    -> Спроба атаки на захищений контракт Crowdfunding (CEI)...");
    await expect(
      attackerAgainstSecure.connect(attackerSigner).attack(1)
    ).to.be.revertedWithCustomError(crowdfundingSecure, "TransferFailed");

    // Крок 6: Перевіряємо, що кошти жертв у безпеці
    const secureBalanceAfter = await ethers.provider.getBalance(secureAddress);
    expect(secureBalanceAfter).to.equal(ethers.parseEther("5"));

    // Атакувальник нічого не вкрав
    expect(await ethers.provider.getBalance(attackerContractAddress)).to.equal(0n);

    console.log(`    ✓ Транзакція атаки успішно відбита та скасована (reverted via CEI)`);
    console.log(`    ✓ Баланс захищеного контракту залишився недоторканим: ${ethers.formatEther(secureBalanceAfter)} ETH`);
  });
});
