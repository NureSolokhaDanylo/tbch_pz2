# Практичне заняття № 2: Смарт-контракти та децентралізований застосунок (dApp)
## Сценарій A: Краудфандинг із поверненням коштів

Проєкт децентралізованої платформи краудфандингу на базі Solidity (0.8.28), OpenZeppelin, Hardhat та автономного вебінтерфейсу на Ethers.js v6.

---

## 📁 Структура проєкту

```text
├── contracts/
│   ├── AuthorRegistry.sol          # Реєстр авторизованих авторів кампаній (Ownable, IAuthorRegistry)
│   ├── Crowdfunding.sol            # Головний контракт краудфандингу (Ownable, Pausable, Pull over Push, CEI)
│   ├── CrowdfundingOptimized.sol   # Оптимізована за газом версія (Storage Packing 3 слоти, кешування SLOAD)
│   ├── RewardToken.sol             # ERC-20 токен винагород для вкладників (Ownable, IRewardToken)
│   ├── Attacker.sol                # Контракт-атакувальник для демонстрації Reentrancy
│   ├── interfaces/                 # Інтерфейси взаємодії (IAuthorRegistry, ICrowdfunding, IRewardToken)
│   └── testing/
│       └── CrowdfundingVulnerable.sol # Вразлива версія з порушенням CEI для навчальної атаки
├── docs/
│   └── diagrams/                   # Діаграми у форматі Draw.io (.drawio) та Mermaid
├── frontend/
│   └── index.html                  # Автономний вебінтерфейс (Ethers.js v6 CDN, без збірки)
├── test/
│   ├── crowdfunding.test.js        # Повний набір із 37 тестів (покриття >90%, перевірка часу і revert)
│   ├── ReentrancyAttack.test.js    # Тест навчальної атаки (успішна крадіжка vs блокування через CEI)
│   └── gasCompare.test.js          # Порівняльний тест витрат газу «До і Після» оптимізації
├── scripts/
│   └── deploy.js                   # Скрипт розгортання в локальній мережі або Sepolia
├── hardhat.config.js               # Конфігурація мереж (localhost, sepolia), компілятора та gasReporter
├── .env.example                    # Зразок змінних середовища для розгортання в Sepolia
└── package.json                    # Залежності та скрипти
```

---

## 🚀 Швидкий запуск і тестування

### 1. Запуск усіх тестів (37+ тестів, 100% проходження)
```bash
npm test
```

### 2. Запуск аналізу покриття коду (>90%)
```bash
npx hardhat coverage
```

### 3. Демонстрація навчальної атаки Reentrancy
```bash
npx hardhat test test/ReentrancyAttack.test.js
```
*Тест 1 показує успішне спустошення уразливого контракту до 0 ETH.*  
*Тест 2 демонструє блокування атаки захищеним контрактом із дотриманням Checks-Effects-Interactions.*

### 4. Замір і порівняння витрат газу («До і Після»)
```bash
npx hardhat test test/gasCompare.test.js
```

---

## 🌐 Робота з вебінтерфейсом (dApp)

1. **Запуск локальної ноди Hardhat** (в окремому терміналі):
   ```bash
   npx hardhat node
   ```

2. **Розгортання контрактів у локальній мережі**:
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```

3. **Відкриття вебінтерфейсу**:
   Відкрийте файл `frontend/index.html` у будь-якому сучасному браузері (або через Live Server).  
   Підключіть MetaMask до мережі `Hardhat Localhost` (RPC: `http://127.0.0.1:8545`, Chain ID: `31337`).

---

## 🔍 Статичний аналіз (Slither)

```bash
slither contracts/Crowdfunding.sol --filter-paths "@openzeppelin"
```
