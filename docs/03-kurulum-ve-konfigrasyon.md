# 3. Kurulum ve Konfigürasyon

## 3.1 Sistem Gereksinimleri

### 💻 Donanım Gereksinimleri

#### Minimum Sistem Gereksinimleri
| Bileşen | Minimum | Önerilen | Optimal |
|---------|---------|----------|---------|
| **İşlemci** | Intel i3 / AMD Ryzen 3 | Intel i5 / AMD Ryzen 5 | Intel i7 / AMD Ryzen 7+ |
| **RAM** | 4GB | 8GB | 16GB+ |
| **Disk Alanı** | 2GB boş alan | 5GB boş alan | 10GB+ boş alan |
| **GPU** | İsteğe bağlı | 4GB VRAM | 8GB+ VRAM (yerel LLM için) |
| **İnternet** | 1 Mbps | 10 Mbps | 50 Mbps+ |

#### Platform Desteği
```bash
# Desteklenen işletim sistemleri
✅ Windows 10/11 (x64)
✅ macOS 10.15+ (Intel/Apple Silicon)
✅ Linux Ubuntu 18.04+ / Debian 10+
✅ Linux CentOS 7+ / RHEL 7+
✅ Linux Arch / Manjaro
```

### 🛠️ Yazılım Gereksinimleri

#### Temel Gereksinimler
```json
{
  "vscode": {
    "minimum": "1.90.0",
    "recommended": "1.95.0+",
    "features": [
      "Webview API",
      "Extension API",
      "Command API",
      "File System API"
    ]
  },
  "nodejs": {
    "minimum": "18.0.0",
    "recommended": "20.0.0+",
    "lts": "20.11.0"
  },
  "npm": {
    "minimum": "9.0.0",
    "recommended": "10.0.0+"
  }
}
```

#### Opsiyonel Bağımlılıklar
```bash
# Python (vLLM için)
Python 3.8+
pip 21.0+
virtualenv

# Git (versiyon kontrolü için)
Git 2.25+

# Docker (containerized deployment için)
Docker 20.10+
Docker Compose 2.0+
```

---

## 3.2 Extension Kurulumu

### 📦 VSIX Paketi ile Kurulum

#### 1. Manuel Kurulum
```bash
# VSIX dosyasını indirin
curl -L -o baykar-ivme-2.2.7.vsix \
  "https://github.com/baykar/ivme/releases/latest/download/baykar-ivme-2.2.7.vsix"

# Extension'ı yükleyin
code --install-extension baykar-ivme-2.2.7.vsix

# Kurulumu doğrulayın
code --list-extensions | grep ivme
```

#### 2. VS Code UI ile Kurulum
1. VS Code'u açın
2. `Ctrl+Shift+P` (Windows/Linux) veya `Cmd+Shift+P` (macOS)
3. "Extensions: Install from VSIX..." komutunu çalıştırın
4. İndirilen `.vsix` dosyasını seçin
5. "Reload" butonuna tıklayın

#### 3. Komut Satırı ile Toplu Kurulum
```bash
#!/bin/bash
# install-ivme.sh

VSIX_URL="https://github.com/baykar/ivme/releases/latest/download/baykar-ivme-2.2.7.vsix"
TEMP_FILE="/tmp/baykar-ivme.vsix"

echo "İvme Extension kuruluyor..."

# VSIX dosyasını indir
curl -L -o "$TEMP_FILE" "$VSIX_URL"

# Extension'ı yükle
code --install-extension "$TEMP_FILE"

# Geçici dosyayı sil
rm "$TEMP_FILE"

echo "Kurulum tamamlandı! VS Code'u yeniden başlatın."
```

### 🔄 Güncelleme İşlemi

#### Otomatik Güncelleme
```typescript
// Extension otomatik güncelleme kontrolü
interface UpdateChecker {
  checkForUpdates(): Promise<UpdateInfo | null>;
  downloadUpdate(updateInfo: UpdateInfo): Promise<void>;
  applyUpdate(): Promise<void>;
}

// Manuel güncelleme kontrolü
const updateChecker = new UpdateChecker();
const updateInfo = await updateChecker.checkForUpdates();

if (updateInfo) {
  vscode.window.showInformationMessage(
    `İvme ${updateInfo.version} sürümü mevcut. Güncellemek ister misiniz?`,
    'Güncelle', 'Daha Sonra'
  ).then(selection => {
    if (selection === 'Güncelle') {
      updateChecker.downloadUpdate(updateInfo);
    }
  });
}
```

#### Manuel Güncelleme
```bash
# Mevcut sürümü kaldır
code --uninstall-extension ivme.ivme-ivme

# Yeni sürümü yükle  
code --install-extension baykar-ivme-2.2.7.vsix

# Extension listesini kontrol et
code --list-extensions --show-versions | grep ivme
```

---

## 3.3 AI Servisleri Konfigürasyonu

### 🤖 vLLM Sunucusu Kurulumu

#### Docker ile Kurulum (Önerilen)
```yaml
# docker-compose.yml
version: '3.8'
services:
  vllm-server:
    image: vllm/vllm-openai:latest
    ports:
      - "8000:8000"
    volumes:
      - ./models:/models
      - ./cache:/cache
    environment:
      - MODEL_NAME=Qwen/Qwen1.5-7B-Chat
      - HOST=0.0.0.0
      - PORT=8000
      - GPU_MEMORY_UTILIZATION=0.8
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    command: >
      python -m vllm.entrypoints.openai.api_server
      --model ${MODEL_NAME}
      --host ${HOST}
      --port ${PORT}
      --gpu-memory-utilization ${GPU_MEMORY_UTILIZATION}
      --max-model-len 4096
      --enable-chunked-prefill
      --max-num-batched-tokens 8192
```

```bash
# Docker compose ile başlatma
docker-compose up -d vllm-server

# Log kontrolü
docker-compose logs -f vllm-server

# Health check
curl http://localhost:8000/v1/models
```

#### Manuel Python Kurulumu
```bash
# Python sanal ortamı oluştur
python -m venv vllm-env
source vllm-env/bin/activate  # Linux/Mac
# vllm-env\Scripts\activate   # Windows

# vLLM ve bağımlılıkları yükle
pip install --upgrade pip
pip install vllm
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Model indirme (opsiyonel - otomatik indirilir)
python -c "
from huggingface_hub import snapshot_download
snapshot_download('Qwen/Qwen1.5-7B-Chat', cache_dir='./models')
"

# Sunucuyu başlat
python -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen1.5-7B-Chat \
    --host 0.0.0.0 \
    --port 8000 \
    --gpu-memory-utilization 0.8 \
    --max-model-len 4096
```

#### vLLM Konfigürasyon Dosyası
```json
// vllm-config.json
{
  "model": {
    "name": "Qwen/Qwen1.5-7B-Chat",
    "trust_remote_code": true,
    "max_model_len": 4096,
    "gpu_memory_utilization": 0.8,
    "tensor_parallel_size": 1
  },
  "server": {
    "host": "0.0.0.0",
    "port": 8000,
    "ssl_keyfile": null,
    "ssl_certfile": null,
    "root_path": null,
    "middleware": []
  },
  "engine": {
    "max_num_batched_tokens": 8192,
    "max_num_seqs": 256,
    "enable_chunked_prefill": true,
    "disable_log_stats": false
  }
}
```

### 💎 Google Gemini Konfigürasyonu

#### API Anahtarı Alma
1. **Google AI Studio**'ya gidin: https://aistudio.google.com/
2. **Get API Key** butonuna tıklayın
3. Yeni bir proje oluşturun veya mevcut projeyi seçin
4. API anahtarını kopyalayın

#### API Anahtarı Güvenlik
```typescript
// Güvenli API anahtar saklama
class SecureApiKeyManager {
  private static readonly GEMINI_KEY = 'gemini.apiKey';
  
  static async storeApiKey(
    context: vscode.ExtensionContext, 
    apiKey: string
  ): Promise<void> {
    await context.secrets.store(this.GEMINI_KEY, apiKey);
  }
  
  static async getApiKey(
    context: vscode.ExtensionContext
  ): Promise<string | undefined> {
    return context.secrets.get(this.GEMINI_KEY);
  }
  
  static async deleteApiKey(
    context: vscode.ExtensionContext
  ): Promise<void> {
    await context.secrets.delete(this.GEMINI_KEY);
  }
}
```

#### Gemini Servis Testi
```bash
# API anahtarını test et
curl -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
     "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_API_KEY"
```

---

## 3.4 Extension Ayarları

### ⚙️ Ayar Kategorileri

#### 1. Servis Ayarları
```json
// settings.json örneği
{
  "baykar-ai-fixer.api.activeService": "vLLM",
  "baykar-ai-fixer.vllm.baseUrl": "http://localhost:8000/v1",
  "baykar-ai-fixer.vllm.modelName": "Qwen/Qwen1.5-7B-Chat",
  "baykar-ai-fixer.vllm.embeddingModelName": "",
  "baykar-ai-fixer.gemini.apiKey": "your-api-key-here"
}
```

#### 2. Chat Ayarları
```json
{
  "baykar-ai-fixer.chat.conversationHistoryLimit": 2,
  "baykar-ai-fixer.chat.tokenLimit": 12000,
  "baykar-ai-fixer.chat.temperature": 0.7
}
```

#### 3. İndeksleme Ayarları
```json
{
  "baykar-ai-fixer.indexing.enabled": true,
  "baykar-ai-fixer.indexing.sourceName": "workspace",
  "baykar-ai-fixer.indexing.includeGlobs": [
    "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx",
    "**/*.py", "**/*.{c,cc,cpp,cxx,h,hpp,hxx,c++}",
    "**/*.json", "**/*.css"
  ],
  "baykar-ai-fixer.indexing.excludeGlobs": [
    "**/node_modules/**", "**/dist/**", "**/out/**",
    "**/.git/**", "**/.ivme/**", "**/.vscode/**"
  ],
  "baykar-ai-fixer.indexing.summaryTimeoutMs": 25000,
  "baykar-ai-fixer.indexing.embeddingTimeoutMs": 45000
}
```

### 🎨 UI Ayarları
```json
{
  "baykar-ai-fixer.ui.agentModeActive": false,
  "baykar-ai-fixer.ui.agentBarExpanded": false,
  "baykar-ai-fixer.ui.language": "tr",
  "baykar-ai-fixer.ui.theme": "auto",
  "baykar-ai-fixer.ui.backgroundVideo": true
}
```

### 🔧 Gelişmiş Ayarlar

#### Workspace-specific Ayarlar
```json
// .vscode/settings.json
{
  "baykar-ai-fixer.indexing.sourceName": "my-project-v1",
  "baykar-ai-fixer.indexing.vectorStorePath": "./.ivme/vector_store.json",
  "baykar-ai-fixer.indexing.includeGlobs": [
    "src/**/*.ts",
    "lib/**/*.js",
    "!**/*.test.*"
  ]
}
```

#### Global User Ayarları
```json
// ~/.vscode/User/settings.json
{
  "baykar-ai-fixer.api.activeService": "Gemini",
  "baykar-ai-fixer.chat.temperature": 0.5,
  "baykar-ai-fixer.ui.language": "en"
}
```

---

## 3.5 İlk Kurulum Sihirbazı

### 🧙‍♂️ Setup Wizard Akışı

```typescript
// Setup wizard implementation
class SetupWizard {
  private steps: WizardStep[] = [
    new WelcomeStep(),
    new ServiceSelectionStep(),
    new VllmConfigStep(),
    new GeminiConfigStep(),
    new IndexingSetupStep(),
    new CompletionStep()
  ];
  
  async run(): Promise<SetupResult> {
    const config = new ExtensionConfig();
    
    for (const step of this.steps) {
      const result = await step.execute(config);
      
      if (result.action === 'cancel') {
        return new SetupResult('cancelled');
      }
      
      if (result.action === 'back') {
        // Go back to previous step
        continue;
      }
      
      config.merge(result.config);
    }
    
    await this.applyConfiguration(config);
    return new SetupResult('completed', config);
  }
}

// Welcome step
class WelcomeStep implements WizardStep {
  async execute(config: ExtensionConfig): Promise<StepResult> {
    const selection = await vscode.window.showInformationMessage(
      '🚀 İvme Extension\'ına hoş geldiniz! Kuruluma başlamak için devam edin.',
      { modal: true },
      'Devam Et', 'İptal'
    );
    
    if (selection === 'İptal') {
      return new StepResult('cancel');
    }
    
    return new StepResult('next');
  }
}

// Service selection step
class ServiceSelectionStep implements WizardStep {
  async execute(config: ExtensionConfig): Promise<StepResult> {
    const items = [
      {
        label: '🤖 vLLM (Yerel Sunucu)',
        description: 'Hızlı ve güvenli, yerel sunucu gerektirir',
        detail: 'Önerilen: Daha iyi performans ve gizlilik',
        value: 'vLLM'
      },
      {
        label: '💎 Google Gemini (Bulut)',
        description: 'Güçlü AI modelleri, internet bağlantısı gerektirir',
        detail: 'API anahtarı gerekir',
        value: 'Gemini'
      }
    ];
    
    const selection = await vscode.window.showQuickPick(items, {
      title: 'AI Servisi Seçin',
      placeHolder: 'Hangi AI servisini kullanmak istiyorsunuz?'
    });
    
    if (!selection) {
      return new StepResult('cancel');
    }
    
    config.set('api.activeService', selection.value);
    return new StepResult('next');
  }
}
```

### 📋 Kurulum Kontrol Listesi

#### Pre-installation Checklist
```bash
# Sistem uyumluluğu kontrolü
✅ VS Code 1.90.0+ yüklü
✅ Node.js 18+ yüklü  
✅ Yeterli disk alanı (2GB+)
✅ İnternet bağlantısı

# vLLM için ek kontroller (eğer seçilmişse)
✅ Python 3.8+ yüklü
✅ pip güncel (21.0+)
✅ GPU sürücüleri (CUDA için)
✅ Yeterli RAM (8GB+)
```

#### Post-installation Verification
```typescript
// Installation verification
class InstallationVerifier {
  async verify(): Promise<VerificationResult> {
    const results = new VerificationResult();
    
    // Extension yüklü mü?
    const extensions = vscode.extensions.all;
    const ivmeExtension = extensions.find(ext => 
      ext.id === 'ivme.ivme-ivme'
    );
    
    results.add('extension_installed', !!ivmeExtension);
    
    // API servisleri erişilebilir mi?
    if (this.isVllmConfigured()) {
      results.add('vllm_connection', await this.testVllmConnection());
    }
    
    if (this.isGeminiConfigured()) {
      results.add('gemini_connection', await this.testGeminiConnection());
    }
    
    // Workspace indexing çalışıyor mu?
    results.add('indexing_ready', await this.testIndexing());
    
    return results;
  }
  
  private async testVllmConnection(): Promise<boolean> {
    try {
      const config = vscode.workspace.getConfiguration('baykar-ai-fixer');
      const baseUrl = config.get<string>('vllm.baseUrl');
      
      const response = await fetch(`${baseUrl}/models`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

---

## 3.6 Çoklu Ortam Konfigürasyonu

### 🏢 Enterprise Deployment

#### Centralized Configuration
```yaml
# enterprise-config.yml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ivme-config
data:
  default-settings.json: |
    {
      "baykar-ai-fixer.api.activeService": "vLLM",
      "baykar-ai-fixer.vllm.baseUrl": "http://internal-vllm.company.com:8000/v1",
      "baykar-ai-fixer.indexing.enabled": true,
      "baykar-ai-fixer.ui.language": "tr"
    }
  
  policy.json: |
    {
      "allowedServices": ["vLLM"],
      "blockedServices": ["Gemini"],
      "maxTokenLimit": 8000,
      "indexingPolicy": {
        "allowedFileTypes": ["ts", "js", "py"],
        "excludePaths": ["**/secret/**", "**/private/**"]
      }
    }
```

#### Group Policy Integration (Windows)
```registry
[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\VSCode\Extensions\ivme-ivme]
"AllowedServices"=dword:00000001
"DefaultService"="vLLM"
"VllmBaseUrl"="http://company-vllm.internal:8000/v1"
"ForceSettings"=dword:00000001
```

### 🐳 Docker Development Environment

```dockerfile
# Dockerfile.dev
FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:18

# vLLM dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv

# Create vLLM environment
RUN python3 -m venv /opt/vllm-env
RUN /opt/vllm-env/bin/pip install vllm

# Extension development tools
RUN npm install -g @vscode/vsce yo generator-code

# Copy extension source
COPY . /workspace
WORKDIR /workspace

# Install extension dependencies
RUN npm install

# Compile extension
RUN npm run compile

# Expose ports
EXPOSE 8000 3000

# Start script
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
```

```bash
#!/bin/bash
# docker/start.sh

# Start vLLM server in background
/opt/vllm-env/bin/python -m vllm.entrypoints.openai.api_server \
    --model Qwen/Qwen1.5-7B-Chat \
    --host 0.0.0.0 \
    --port 8000 &

# Wait for vLLM to be ready
echo "Waiting for vLLM server..."
while ! curl -s http://localhost:8000/v1/models > /dev/null; do
    sleep 2
done

echo "vLLM server is ready!"

# Start VS Code server (if using code-server)
if command -v code-server &> /dev/null; then
    code-server --bind-addr 0.0.0.0:3000 /workspace
else
    echo "Development environment ready!"
    tail -f /dev/null
fi
```

### ☁️ Cloud Configuration

#### AWS Setup
```yaml
# aws-deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: vllm-server
  template:
    metadata:
      labels:
        app: vllm-server
    spec:
      containers:
      - name: vllm
        image: vllm/vllm-openai:latest
        ports:
        - containerPort: 8000
        env:
        - name: MODEL_NAME
          value: "Qwen/Qwen1.5-7B-Chat"
        resources:
          requests:
            nvidia.com/gpu: 1
            memory: "8Gi"
            cpu: "2"
          limits:
            nvidia.com/gpu: 1
            memory: "16Gi"
            cpu: "4"
```

#### Azure Setup
```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "vmName": {
      "type": "string",
      "defaultValue": "ivme-vllm-vm"
    }
  },
  "resources": [
    {
      "type": "Microsoft.Compute/virtualMachines",
      "apiVersion": "2021-03-01",
      "name": "[parameters('vmName')]",
      "location": "[resourceGroup().location]",
      "properties": {
        "hardwareProfile": {
          "vmSize": "Standard_NC6s_v3"
        },
        "osProfile": {
          "computerName": "[parameters('vmName')]",
          "adminUsername": "azureuser",
          "customData": "[base64(concat('#cloud-config\nruncmd:\n  - docker run -d -p 8000:8000 vllm/vllm-openai:latest'))]"
        }
      }
    }
  ]
}
```

---

## 3.7 Troubleshooting ve Yaygın Sorunlar

### ❌ Kurulum Sorunları

#### Extension Yüklenmiyor
```bash
# Problem: Extension yüklenmiyor
# Çözüm 1: VS Code cache temizle
rm -rf ~/.vscode/extensions
code --list-extensions

# Çözüm 2: Yönetici yetkileri ile yükle (Windows)
# PowerShell'i yönetici olarak aç
code --install-extension baykar-ivme-2.2.7.vsix

# Çözüm 3: Manuel kurulum
# Extension dosyasını VS Code extensions klasörüne kopyala
cp baykar-ivme-2.2.7.vsix ~/.vscode/extensions/
```

#### vLLM Bağlantı Sorunları
```bash
# Problem: vLLM sunucusuna bağlanılamıyor
# Debug 1: Port kontrolü
netstat -an | grep 8000
lsof -i :8000

# Debug 2: Sunucu logları
docker logs vllm-server
# veya
tail -f vllm.log

# Debug 3: Manuel test
curl -X GET http://localhost:8000/v1/models
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen1.5-7B-Chat","messages":[{"role":"user","content":"Hello"}]}'

# Çözüm: Firewall ayarları
sudo ufw allow 8000
# Windows'ta Windows Defender Firewall'da port aç
```

#### Gemini API Sorunları
```typescript
// API anahtarı test
async function testGeminiApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    if (!response.ok) {
      console.error('Gemini API Error:', response.statusText);
      return false;
    }
    
    const data = await response.json();
    console.log('Available models:', data.models?.length || 0);
    return true;
  } catch (error) {
    console.error('Gemini API Test Failed:', error);
    return false;
  }
}
```

### 🔍 Diagnostic Tools

#### Extension Health Check
```typescript
// Extension sağlık kontrolü
class ExtensionHealthCheck {
  async runDiagnostics(): Promise<DiagnosticReport> {
    const report = new DiagnosticReport();
    
    // 1. Extension durumu
    report.addCheck('extension_active', this.isExtensionActive());
    
    // 2. API servisleri
    report.addCheck('vllm_available', await this.checkVllmService());
    report.addCheck('gemini_available', await this.checkGeminiService());
    
    // 3. Dosya sistemi izinleri
    report.addCheck('fs_permissions', await this.checkFileSystemAccess());
    
    // 4. Workspace durumu
    report.addCheck('workspace_ready', this.checkWorkspaceSetup());
    
    // 5. Bellek kullanımı
    report.addCheck('memory_usage', this.checkMemoryUsage());
    
    return report;
  }
  
  private async checkVllmService(): Promise<boolean> {
    try {
      const config = vscode.workspace.getConfiguration('baykar-ai-fixer');
      const baseUrl = config.get<string>('vllm.baseUrl');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${baseUrl}/v1/models`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

#### Automated Repair
```typescript
// Otomatik onarım sistemi
class AutoRepair {
  async repairExtension(): Promise<RepairResult> {
    const results: RepairResult[] = [];
    
    // 1. Konfigürasyon onarımı
    results.push(await this.repairConfiguration());
    
    // 2. Cache temizliği
    results.push(await this.clearCaches());
    
    // 3. İndeks yeniden oluşturma
    results.push(await this.rebuildIndex());
    
    // 4. Servis bağlantı testleri
    results.push(await this.testServiceConnections());
    
    return new CombinedRepairResult(results);
  }
  
  private async repairConfiguration(): Promise<RepairResult> {
    try {
      const config = vscode.workspace.getConfiguration('baykar-ai-fixer');
      
      // Eksik ayarları varsayılan değerlerle doldur
      const defaults = {
        'api.activeService': 'vLLM',
        'chat.temperature': 0.7,
        'chat.tokenLimit': 12000,
        'indexing.enabled': true
      };
      
      for (const [key, value] of Object.entries(defaults)) {
        if (config.get(key) === undefined) {
          await config.update(key, value, vscode.ConfigurationTarget.Global);
        }
      }
      
      return new RepairResult('configuration', true, 'Konfigürasyon onarıldı');
    } catch (error) {
      return new RepairResult('configuration', false, error.message);
    }
  }
}
```

---

<div align="center">
  <h2>⚡ Hızlı ve Kolay Kurulum</h2>
  <p><em>Birkaç dakikada production-ready İvme deneyimi</em></p>
</div>
