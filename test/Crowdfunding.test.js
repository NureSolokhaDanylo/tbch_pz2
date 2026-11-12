const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Crowdfunding Full Test Suite (Комплексне покриття 26+ тестів)", function () {
  let admin, author, contributor1, contributor2, unauthorizedUser;
  let authorRegistry, rewardToken, crowdfunding;

  const ONE_DAY = 24 * 60 * 60;
  const GOAL = ethers.parseEther("10"); // 10 ETH

  beforeEach(async function () {
    [admin, author, contributor1, contributor2, unauthorizedUser] = await ethers.getSigners();

    // 1. Деплой AuthorRegistry
    const AuthorRegistryFactory = await ethers.getContractFactory("AuthorRegistry");
    authorRegistry = await AuthorRegistryFactory.deploy(admin.address);
    await authorRegistry.waitForDeployment();

    // 2. Деплой RewardToken
    const RewardTokenFactory = await ethers.getContractFactory("RewardToken");
    rewardToken = await RewardTokenFactory.deploy(admin.address);
    await rewardToken.waitForDeployment();

    // 3. Деплой Crowdfunding
    const CrowdfundingFactory = await ethers.getContractFactory("Crowdfunding");
    crowdfunding = await CrowdfundingFactory.deploy(
      await authorRegistry.getAddress(),
      await rewardToken.getAddress(),
      admin.address
    );
    await crowdfunding.waitForDeployment();

    // 4. Передача володіння RewardToken платформі Crowdfunding
    await rewardToken.connect(admin).transferOwnership(await crowdfunding.getAddress());
  });

  // =========================================================================
  // БЛОК 1: КОНСТРУКТОРИ ТА ІНІЦІАЛІЗАЦІЯ
  // =========================================================================
  describe("1. Ініціалізація та валідація параметрів конструкторів", function () {
    it("1.1 Успішна ініціалізація та встановлення залежностей", async function () {
      expect(await crowdfunding.authorRegistry()).to.equal(await authorRegistry.getAddress());
      expect(await crowdfunding.rewardToken()).to.equal(await rewardToken.getAddress());
      expect(await crowdfunding.owner()).to.equal(admin.address);
      expect(await crowdfunding.campaignCount()).to.equal(0n);
    });

    it("1.2 Revert при нульовій адресі AuthorRegistry у Crowdfunding", async function () {
      const CrowdfundingFactory = await ethers.getContractFactory("Crowdfunding");
      await expect(
        CrowdfundingFactory.deploy(ethers.ZeroAddress, await rewardToken.getAddress(), admin.address)
      ).to.be.revertedWithCustomError(crowdfunding, "ZeroAddress");
    });

    it("1.3 Revert при нульовій адресі RewardToken у Crowdfunding", async function () {
      const CrowdfundingFactory = await ethers.getContractFactory("Crowdfunding");
      await expect(
        CrowdfundingFactory.deploy(await authorRegistry.getAddress(), ethers.ZeroAddress, admin.address)
      ).to.be.revertedWithCustomError(crowdfunding, "ZeroAddress");
    });

    it("1.4 Revert при нульовій адресі Admin у Crowdfunding", async function () {
      const CrowdfundingFactory = await ethers.getContractFactory("Crowdfunding");
      await expect(
        CrowdfundingFactory.deploy(await authorRegistry.getAddress(), await rewardToken.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(crowdfunding, "OwnableInvalidOwner")
       .withArgs(ethers.ZeroAddress);
    });

    it("1.5 Revert при нульовій адресі в конструкторі AuthorRegistry та RewardToken", async function () {
      const AuthorRegistryFactory = await ethers.getContractFactory("AuthorRegistry");
      await expect(AuthorRegistryFactory.deploy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(authorRegistry, "OwnableInvalidOwner")
        .withArgs(ethers.ZeroAddress);

      const RewardTokenFactory = await ethers.getContractFactory("RewardToken");
      await expect(RewardTokenFactory.deploy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(rewardToken, "OwnableInvalidOwner")
        .withArgs(ethers.ZeroAddress);
    });
  });

  // =========================================================================
  // БЛОК 2: РЕЄСТР АВТОРІВ (AuthorRegistry)
  // =========================================================================
  describe("2. Керування реєстром авторів (AuthorRegistry)", function () {
    it("2.1 Адмін успішно додає автора та генерується AuthorVerified", async function () {
      await expect(authorRegistry.connect(admin).addAuthor(author.address))
        .to.emit(authorRegistry, "AuthorVerified")
        .withArgs(author.address, admin.address);

      expect(await authorRegistry.isVerified(author.address)).to.be.true;
    });

    it("2.2 Revert при спробі додавання автора не адміністратором", async function () {
      await expect(
        authorRegistry.connect(unauthorizedUser).addAuthor(author.address)
      ).to.be.revertedWithCustomError(authorRegistry, "OwnableUnauthorizedAccount")
       .withArgs(unauthorizedUser.address);
    });

    it("2.3 Revert при спробі додати нульову адресу автора", async function () {
      await expect(
        authorRegistry.connect(admin).addAuthor(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(authorRegistry, "ZeroAddress");
    });

    it("2.4 Revert при повторному додаванні вже верифікованого автора", async function () {
      await authorRegistry.connect(admin).addAuthor(author.address);
      await expect(
        authorRegistry.connect(admin).addAuthor(author.address)
      ).to.be.revertedWithCustomError(authorRegistry, "AuthorAlreadyVerified")
       .withArgs(author.address);
    });

    it("2.5 Пакетне додавання авторів (batchAddAuthors)", async function () {
      await authorRegistry.connect(admin).batchAddAuthors([author.address, contributor1.address]);
      expect(await authorRegistry.isVerified(author.address)).to.be.true;
      expect(await authorRegistry.isVerified(contributor1.address)).to.be.true;
    });

    it("2.6 Адмін успішно відкликає статус автора (removeAuthor)", async function () {
      await authorRegistry.connect(admin).addAuthor(author.address);
      await expect(authorRegistry.connect(admin).removeAuthor(author.address))
        .to.emit(authorRegistry, "AuthorRevoked")
        .withArgs(author.address, admin.address);

      expect(await authorRegistry.isVerified(author.address)).to.be.false;
    });

    it("2.7 Revert при спробі відкликати статус у неверифікованого автора", async function () {
      await expect(
        authorRegistry.connect(admin).removeAuthor(unauthorizedUser.address)
      ).to.be.revertedWithCustomError(authorRegistry, "AuthorNotVerified")
       .withArgs(unauthorizedUser.address);
    });
  });

  // =========================================================================
  // БЛОК 3: СТВОРЕННЯ КАМПАНІЙ (createCampaign)
  // =========================================================================
  describe("3. Створення кампаній (createCampaign)", function () {
    beforeEach(async function () {
      await authorRegistry.connect(admin).addAuthor(author.address);
    });

    it("3.1 Успішне створення кампанії та генерація CampaignCreated", async function () {
      const duration = 7 * ONE_DAY;
      const tx = await crowdfunding.connect(author).createCampaign(GOAL, duration);
      const receipt = await tx.wait();
      const timestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

      await expect(tx)
        .to.emit(crowdfunding, "CampaignCreated")
        .withArgs(1, author.address, GOAL, timestamp + duration);

      expect(await crowdfunding.campaignCount()).to.equal(1n);

      const campaign = await crowdfunding.getCampaign(1);
      expect(campaign.author).to.equal(author.address);
      expect(campaign.goal).to.equal(GOAL);
      expect(campaign.deadline).to.equal(timestamp + duration);
      expect(campaign.totalPledged).to.equal(0n);
      expect(campaign.claimed).to.be.false;
    });

    it("3.2 Revert при створенні кампанії неверифікованим користувачем", async function () {
      await expect(
        crowdfunding.connect(unauthorizedUser).createCampaign(GOAL, 7 * ONE_DAY)
      ).to.be.revertedWithCustomError(crowdfunding, "NotVerifiedAuthor")
       .withArgs(unauthorizedUser.address);
    });

    it("3.3 Revert при цілі збору, що дорівнює нулю (ZeroGoal)", async function () {
      await expect(
        crowdfunding.connect(author).createCampaign(0, 7 * ONE_DAY)
      ).to.be.revertedWithCustomError(crowdfunding, "ZeroGoal");
    });

    it("3.4 Revert при тривалості, що дорівнює нулю (ZeroDuration)", async function () {
      await expect(
        crowdfunding.connect(author).createCampaign(GOAL, 0)
      ).to.be.revertedWithCustomError(crowdfunding, "ZeroDuration");
    });

    it("3.5 Revert при спробі створення кампанії під час паузи", async function () {
      await crowdfunding.connect(admin).pause();
      await expect(
        crowdfunding.connect(author).createCampaign(GOAL, 7 * ONE_DAY)
      ).to.be.revertedWithCustomError(crowdfunding, "EnforcedPause");
    });
  });

  // =========================================================================
  // БЛОК 4: ВНЕСЕННЯ ВНЕСКІВ (pledge)
  // =========================================================================
  describe("4. Внесення внесків (pledge) та мінтинг RewardToken", function () {
    beforeEach(async function () {
      await authorRegistry.connect(admin).addAuthor(author.address);
      await crowdfunding.connect(author).createCampaign(GOAL, 7 * ONE_DAY);
    });

    it("4.1 Успішний внесок та нарахування токенів RewardToken 1:1", async function () {
      const amount = ethers.parseEther("3");

      await expect(crowdfunding.connect(contributor1).pledge(1, { value: amount }))
        .to.emit(crowdfunding, "Pledged")
        .withArgs(1, contributor1.address, amount, amount)
        .and.to.emit(rewardToken, "Transfer")
        .withArgs(ethers.ZeroAddress, contributor1.address, amount);

      expect(await rewardToken.balanceOf(contributor1.address)).to.equal(amount);
      expect(await crowdfunding.contributions(1, contributor1.address)).to.equal(amount);

      const c = await crowdfunding.getCampaign(1);
      expect(c.totalPledged).to.equal(amount);
    });

    it("4.2 Накопичення кількох внесків від одного й того ж вкладника", async function () {
      await crowdfunding.connect(contributor1).pledge(1, { value: ethers.parseEther("1") });
      await crowdfunding.connect(contributor1).pledge(1, { value: ethers.parseEther("2") });

      expect(await crowdfunding.contributions(1, contributor1.address)).to.equal(ethers.parseEther("3"));
      expect(await rewardToken.balanceOf(contributor1.address)).to.equal(ethers.parseEther("3"));
    });

    it("4.3 Revert при нульовому внеску (ZeroContribution)", async function () {
      await expect(
        crowdfunding.connect(contributor1).pledge(1, { value: 0 })
      ).to.be.revertedWithCustomError(crowdfunding, "ZeroContribution");
    });

    it("4.4 Revert при внеску в неіснуючу кампанію (CampaignDoesNotExist)", async function () {
      await expect(
        crowdfunding.connect(contributor1).pledge(999, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(crowdfunding, "CampaignDoesNotExist")
       .withArgs(999);
    });

    it("4.5 Revert при внеску після дедлайну (CampaignEnded)", async function () {
      await time.increase(8 * ONE_DAY);
      await expect(
        crowdfunding.connect(contributor1).pledge(1, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(crowdfunding, "CampaignEnded");
    });

    it("4.6 Revert при внеску під час паузи", async function () {
      await crowdfunding.connect(admin).pause();
      await expect(
        crowdfunding.connect(contributor1).pledge(1, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(crowdfunding, "EnforcedPause");
    });
  });

  // =========================================================================
  // БЛОК 5: ВИВЕДЕННЯ КОШТІВ АВТОРОМ (claim)
  // =========================================================================
  describe("5. Виведення коштів автором при успіху кампанії (claim)", function () {
    beforeEach(async function () {
      await authorRegistry.connect(admin).addAuthor(author.address);
      await crowdfunding.connect(author).createCampaign(GOAL, 7 * ONE_DAY);
    });

    it("5.1 Автор успішно виводить зібраний ефір після дедлайну при досягненні цілі", async function () {
      // Збираємо 10 ETH повністю
      await crowdfunding.connect(contributor1).pledge(1, { value: ethers.parseEther("6") });
      await crowdfunding.connect(contributor2).pledge(1, { value: ethers.parseEther("4") });

      await time.increase(8 * ONE_DAY);

      const authorBalBefore = await ethers.provider.getBalance(author.address);
      const tx = await crowdfunding.connect(author).claim(1);
      const receipt = await tx.wait();
      const gasSpent = receipt.gasUsed * receipt.gasPrice;

      const authorBalAfter = await ethers.provider.getBalance(author.address);
      expect(authorBalAfter + gasSpent - authorBalBefore).to.equal(GOAL);

      const campaign = await crowdfunding.getCampaign(1);
      expect(campaign.claimed).to.be.true;
    });

    it("5.2 Revert при спробі виведення коштів до настання дедлайну", async function () {
      await crowdfunding.connect(contributor1).pledge(1, { value: GOAL });
      await expect(
        crowdfunding.connect(author).claim(1)
      ).to.be.revertedWithCustomError(crowdfunding, "DeadlineNotPassed");
    });

    it("5.3 Revert при виклику claim не автором кампанії", async function () {
      await crowdfunding.connect(contributor1).pledge(1, { value: GOAL });
      await time.increase(8 * ONE_DAY);
      await expect(
        crowdfunding.connect(unauthorizedUser).claim(1)
      ).to.be.revertedWithCustomError(crowdfunding, "OnlyCampaignAuthor")
       .withArgs(author.address, unauthorizedUser.address);
    });

    it("5.4 Revert при спробі виведення, якщо ціль збору не досягнута", async function () {
      await crowdfunding.connect(contributor1).pledge(1, { value: ethers.parseEther("5") });
      await time.increase(8 * ONE_DAY);
      await expect(
        crowdfunding.connect(author).claim(1)
      ).to.be.revertedWithCustomError(crowdfunding, "GoalNotReached")
       .withArgs(ethers.parseEther("5"), GOAL);
    });

    it("5.5 Revert при повторній спробі виведення (AlreadyClaimed)", async function () {
      await crowdfunding.connect(contributor1).pledge(1, { value: GOAL });
      await time.increase(8 * ONE_DAY);
      await crowdfunding.connect(author).claim(1);

      await expect(
        crowdfunding.connect(author).claim(1)
      ).to.be.revertedWithCustomError(crowdfunding, "AlreadyClaimed");
    });
  });

  // =========================================================================
  // БЛОК 6: ПОВЕРНЕННЯ КОШТІВ ВКЛАДНИКАМ (claimRefund)
  // =========================================================================
  describe("6. Повернення коштів вкладникам (claimRefund - Pull over Push)", function () {
    beforeEach(async function () {
      await authorRegistry.connect(admin).addAuthor(author.address);
      await crowdfunding.connect(author).createCampaign(GOAL, 7 * ONE_DAY);
    });

    it("6.1 Вкладник успішно повертає свій внесок при провалі збору", async function () {
      const pledgeVal = ethers.parseEther("3");
      await crowdfunding.connect(contributor1).pledge(1, { value: pledgeVal });

      await time.increase(8 * ONE_DAY);

      const balBefore = await ethers.provider.getBalance(contributor1.address);
      const tx = await crowdfunding.connect(contributor1).claimRefund(1);
      const receipt = await tx.wait();
      const gasSpent = receipt.gasUsed * receipt.gasPrice;

      const balAfter = await ethers.provider.getBalance(contributor1.address);
      expect(balAfter + gasSpent - balBefore).to.equal(pledgeVal);

      expect(await crowdfunding.contributions(1, contributor1.address)).to.equal(0n);
    });

    it("6.2 Revert при спробі повернення до закінчення дедлайну", async function () {
      await crowdfunding.connect(contributor1).pledge(1, { value: ethers.parseEther("2") });
      await expect(
        crowdfunding.connect(contributor1).claimRefund(1)
      ).to.be.revertedWithCustomError(crowdfunding, "DeadlineNotPassed");
    });

    it("6.3 Revert при спробі повернення в успішній кампанії (GoalAlreadyReached)", async function () {
      await crowdfunding.connect(contributor1).pledge(1, { value: GOAL });
      await time.increase(8 * ONE_DAY);
      await expect(
        crowdfunding.connect(contributor1).claimRefund(1)
      ).to.be.revertedWithCustomError(crowdfunding, "GoalAlreadyReached")
       .withArgs(GOAL, GOAL);
    });

    it("6.4 Revert при виклику повернення користувачем без внеску (NoContribution)", async function () {
      await time.increase(8 * ONE_DAY);
      await expect(
        crowdfunding.connect(unauthorizedUser).claimRefund(1)
      ).to.be.revertedWithCustomError(crowdfunding, "NoContribution");
    });

    it("6.5 Revert при повторній спробі повернення коштів", async function () {
      await crowdfunding.connect(contributor1).pledge(1, { value: ethers.parseEther("1") });
      await time.increase(8 * ONE_DAY);
      await crowdfunding.connect(contributor1).claimRefund(1);

      await expect(
        crowdfunding.connect(contributor1).claimRefund(1)
      ).to.be.revertedWithCustomError(crowdfunding, "NoContribution");
    });
  });

  // =========================================================================
  // БЛОК 7: ПАГІНАЦІЯ ТА АВАРІЙНА ПАУЗА
  // =========================================================================
  describe("7. Пагінація та аварійна пауза (Emergency Stop)", function () {
    beforeEach(async function () {
      await authorRegistry.connect(admin).addAuthor(author.address);
    });

    it("7.1 Коректна пагінація списку кампаній (getCampaigns)", async function () {
      for (let i = 1; i <= 3; i++) {
        await crowdfunding.connect(author).createCampaign(ethers.parseEther(i.toString()), 7 * ONE_DAY);
      }

      const [page1, total] = await crowdfunding.getCampaigns(0, 2);
      expect(total).to.equal(3n);
      expect(page1.length).to.equal(2);
      expect(page1[0].goal).to.equal(ethers.parseEther("1"));
      expect(page1[1].goal).to.equal(ethers.parseEther("2"));

      const [page2] = await crowdfunding.getCampaigns(2, 2);
      expect(page2.length).to.equal(1);
      expect(page2[0].goal).to.equal(ethers.parseEther("3"));
    });

    it("7.2 Revert при limit == 0 у getCampaigns", async function () {
      await expect(
        crowdfunding.getCampaigns(0, 0)
      ).to.be.revertedWithCustomError(crowdfunding, "InvalidPaginationParameters");
    });

    it("7.3 Керування паузою: тільки адмін може викликати pause/unpause", async function () {
      await expect(crowdfunding.connect(unauthorizedUser).pause())
        .to.be.revertedWithCustomError(crowdfunding, "OwnableUnauthorizedAccount")
        .withArgs(unauthorizedUser.address);

      await crowdfunding.connect(admin).pause();
      expect(await crowdfunding.paused()).to.be.true;

      await crowdfunding.connect(admin).unpause();
      expect(await crowdfunding.paused()).to.be.false;
    });

    it("7.4 getCampaign revert при запиті неіснуючого ID", async function () {
      await expect(
        crowdfunding.getCampaign(99)
      ).to.be.revertedWithCustomError(crowdfunding, "CampaignDoesNotExist")
       .withArgs(99);
    });
  });
});
