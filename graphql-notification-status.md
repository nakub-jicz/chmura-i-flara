# GraphQL Queries do Zarządzania Statusem Powiadomienia

## 1. Sprawdzanie Statusu Powiadomienia

### Sprawdź czy app block został już zainstalowany
```graphql
query CheckAutoInstallStatus {
  currentAppInstallation {
    metafields(first: 5, namespace: "auto_install") {
      nodes {
        id
        key
        value
        type
        namespace
        createdAt
        updatedAt
      }
    }
  }
}
```

### Sprawdź konkretnie status instalacji bloku
```graphql
query CheckBlockInstallStatus {
  currentAppInstallation {
    metafields(first: 5, namespace: "auto_install") {
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

## 2. Ustawianie Statusu Powiadomienia

### Oznacz instalację jako zakończoną (ukryje powiadomienie)
```graphql
mutation MarkInstallationComplete {
  metafieldsSet(metafields: [
    {
      namespace: "auto_install"
      key: "block_installed"
      value: "2024-01-15T10:30:00Z"
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

### Usuń status instalacji (pokaże ponownie powiadomienie)
```graphql
mutation ResetInstallationStatus {
  metafieldsDelete(metafields: [
    {
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

### Ustawienie różnych statusów testowych
```graphql
mutation SetCustomInstallStatus($status: String!) {
  metafieldsSet(metafields: [
    {
      namespace: "auto_install"
      key: "block_installed"
      value: $status
      type: "single_line_text_field"
    }
  ]) {
    metafields {
      id
      key
      value
    }
    userErrors {
      field
      message
    }
  }
}
```

## 3. Dodatkowe Metafieldy Debug

### Sprawdź wszystkie app metafields
```graphql
query GetAllAppMetafields {
  currentAppInstallation {
    metafields(first: 50) {
      nodes {
        id
        namespace
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

### Dodaj metafield dla debug
```graphql
mutation AddDebugMetafield {
  metafieldsSet(metafields: [
    {
      namespace: "debug"
      key: "notification_test"
      value: "testing_notifications"
      type: "single_line_text_field"
    }
  ]) {
    metafields {
      id
      key
      value
    }
    userErrors {
      field
      message
    }
  }
}
```

## 4. Zmienne dla Testowania

Przykłady wartości dla zmiennej `$status` w `SetCustomInstallStatus`:

- `"installed"` - pokaże banner sukcesu
- `"already_installed"` - pokaże banner że już skonfigurowane  
- `"error"` - pokaże banner błędu z przyciskiem "Add block"
- `"not_attempted"` - pokaże banner przypomnienia (jeśli są produkty)
- `"previously_attempted"` - ukryje wszystkie bannery

## 5. Jak używać w GraphiQL

1. **Aby sprawdzić aktualny status:**
   - Użyj query `CheckBlockInstallStatus`
   - Szukaj w wynikach metafield z `key: "block_installed"`
   - Jeśli nie ma takiego metafield, oznacza to status `"not_attempted"`
   - Jeśli istnieje, oznacza to że instalacja była już próbowana

2. **Aby ukryć powiadomienie:**
   - Użyj mutation `MarkInstallationComplete`
   - To ustawi status na "ukończone" i ukryje bannery

3. **Aby pokazać powiadomienie ponownie:**
   - Użyj mutation `ResetInstallationStatus`
   - To usunie metafield i przywróci status `"not_attempted"`

4. **Aby testować różne bannery:**
   - Użyj mutation `SetCustomInstallStatus` z różnymi wartościami
   - Odśwież aplikację aby zobaczyć efekt

## 6. Logika Aplikacji

W kodzie aplikacji logika działa następująco:

```javascript
// Status "not_attempted" + masz produkty = Banner przypomnienia
if (blockInstallationStatus === "not_attempted" && configuredProducts.length > 0 && !blockLikelyAdded) {
  // Pokaż: "Setup reminder" banner z przyciskiem "Auto-Add Button Block"
}

// Status "error" = Banner błędu  
if (blockInstallationStatus === "error") {
  // Pokaż: Banner ostrzeżenia z przyciskiem "Add block"
}

// Status "installed" lub "already_installed" = Banner sukcesu
if (blockInstallationStatus === "installed" || blockInstallationStatus === "already_installed") {
  // Pokaż: Banner sukcesu "App block added to your theme"
}
``` 