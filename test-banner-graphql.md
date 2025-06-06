# 🧪 GraphQL Queries do Testowania Bannerów

## Jak testować różne stany powiadomień

**Instrukcje:**
1. Idź do Shopify Admin → Apps → GraphiQL App  
2. Użyj poniższych mutations aby ustawić różne stany
3. Po każdej mutation odśwież aplikację DC External Links
4. Jeśli banner się nie pokazuje, wyczyść localStorage w konsoli przeglądarki

---

## 📋 **1. Sprawdź aktualny status**

```graphql
query CheckCurrentStatus {
  currentAppInstallation {
    metafields(first: 10, namespace: "auto_install") {
      nodes {
        id
        key
        value
        type
        createdAt
        updatedAt
      }
    }
  }
}
```

---

## 🔵 **2. Banner przypomnienia "Setup reminder"**

**Krok 1: Pobierz ID aplikacji**
```graphql
query GetAppId {
  currentAppInstallation {
    id
  }
}
```

**Krok 2: Usuń metafield (użyj ID z kroku 1)**
```graphql
mutation ShowSetupReminder($appId: ID!) {
  metafieldsDelete(metafields: [
    {
      ownerId: $appId
      namespace: "auto_install"
      key: "block_installed"
    }
  ]) {
    deletedMetafields {
      key
      namespace
    }
    userErrors {
      field
      message
    }
  }
}
```

**Zmienne:**
```json
{
  "appId": "gid://shopify/AppInstallation/TWOJE_APP_ID"
}
```

**Efekt:** Niebieski banner z tytułem "Setup reminder" i przyciskiem "Auto-Add Button Block"  
**Warunki:** Musisz mieć skonfigurowane produkty i localStorage nie może mieć `dc-external-links-block-added = true`

---

## 🟡 **3. Banner błędu**

```graphql
mutation ShowErrorBanner {
  metafieldsSet(metafields: [
    {
      namespace: "auto_install"
      key: "block_installed"
      value: "error"
      type: "single_line_text_field"
    }
  ]) {
    metafields {
      id
      key
      value
      namespace
    }
    userErrors {
      field
      message
    }
  }
}
```

**Efekt:** Żółty banner ostrzeżenia "Add the app block to your theme" z przyciskiem "Add block"

---

## 🟢 **4. Banner sukcesu - nowo zainstalowane**

```graphql
mutation ShowSuccessBanner {
  metafieldsSet(metafields: [
    {
      namespace: "auto_install"
      key: "block_installed"
      value: "installed"
      type: "single_line_text_field"
    }
  ]) {
    metafields {
      id
      key
      value
      namespace
    }
    userErrors {
      field
      message
    }
  }
}
```

**Efekt:** Zielony banner sukcesu "App block added to your theme"

---

## 🟢 **5. Banner sukcesu - już skonfigurowane**

```graphql
mutation ShowAlreadyInstalledBanner {
  metafieldsSet(metafields: [
    {
      namespace: "auto_install"
      key: "block_installed"
      value: "already_installed"
      type: "single_line_text_field"
    }
  ]) {
    metafields {
      id
      key
      value
      namespace
    }
    userErrors {
      field
      message
    }
  }
}
```

**Efekt:** Zielony banner "App block is active in your theme"

---

## ❌ **6. Ukryj wszystkie bannery**

```graphql
mutation HideAllBanners {
  metafieldsSet(metafields: [
    {
      namespace: "auto_install"
      key: "block_installed"
      value: "previously_attempted"
      type: "single_line_text_field"
    }
  ]) {
    metafields {
      id
      key
      value
      namespace
    }
    userErrors {
      field
      message
    }
  }
}
```

**Alternatywnie - całkowite usunięcie metafield:**
```graphql
mutation CompletelyHideBanners($appId: ID!) {
  metafieldsDelete(metafields: [
    {
      ownerId: $appId
      namespace: "auto_install"
      key: "block_installed"
    }
  ]) {
    deletedMetafields { key }
    userErrors { message }
  }
}
```

**Efekt:** Żadne bannery się nie pokażą

---

## 🔧 **Troubleshooting**

### Jeśli banner się nie pokazuje po mutation:

1. **Wyczyść localStorage:**
   ```javascript
   // W konsoli przeglądarki (F12):
   localStorage.removeItem('dc-external-links-block-added');
   localStorage.removeItem('dc-auto-install-notification-dismissed');
   location.reload();
   ```

2. **Sprawdź czy masz produkty:**
   - Banner przypomnienia pokazuje się tylko gdy masz skonfigurowane produkty
   - Sprawdź czy w aplikacji pokazuje "X configured" gdzie X > 0

3. **Sprawdź czy mutation zadziałała:**
   ```graphql
   query VerifyChange {
     currentAppInstallation {
       metafields(first: 5, namespace: "auto_install") {
         nodes { key, value }
       }
     }
   }
   ```

---

## 📝 **Mapowanie statusów na bannery:**

| Status | Banner | Kolor | Przycisk |
|--------|--------|-------|----------|
| `"not_attempted"` | Setup reminder | Niebieski | Auto-Add Button Block |
| `"error"` | Error warning | Żółty | Add block |
| `"installed"` | Success new | Zielony | (X do zamknięcia) |
| `"already_installed"` | Success existing | Zielony | (X do zamknięcia) |
| `"previously_attempted"` | (ukryty) | - | - |

---

## ⚡ **Szybkie testowanie:**

```graphql
# 1. Pobierz App ID
query GetAppId {
  currentAppInstallation { id }
}

# 2. Reset do czystego stanu (użyj App ID z kroku 1)
mutation Reset($appId: ID!) {
  metafieldsDelete(metafields: [{ownerId: $appId, namespace: "auto_install", key: "block_installed"}]) {
    deletedMetafields { key }
  }
}

# 3. Ustawienie błędu  
mutation Error {
  metafieldsSet(metafields: [{namespace: "auto_install", key: "block_installed", value: "error", type: "single_line_text_field"}]) {
    metafields { value }
  }
}

# 4. Ustawienie sukcesu
mutation Success {
  metafieldsSet(metafields: [{namespace: "auto_install", key: "block_installed", value: "installed", type: "single_line_text_field"}]) {
    metafields { value }
  }
}
``` 