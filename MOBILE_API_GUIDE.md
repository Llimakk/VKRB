# VKRB Navigator — Mobile API Guide (iOS / SwiftUI)

Руководство для разработчика мобильного приложения. Содержит все эндпоинты, форматы данных и привязку к экранам.

---

## Базовая информация

```text
Base URL:  http://localhost:8000      (dev)
Swagger:   http://localhost:8000/docs
```

### Авторизация

Все защищённые запросы требуют заголовок:

```text
Authorization: Bearer <access_token>
```

Токен получается при логине или регистрации. Время жизни — 24 часа (настраивается).

### Коды ошибок

| Код | Значение |
| --- | --- |
| 401 | Токен отсутствует, истёк или недействителен |
| 403 | Доступ запрещён |
| 404 | Объект не найден |
| 409 | Конфликт (email уже занят и т.п.) |
| 422 | Ошибка валидации тела запроса |

---

## Swift Codable — базовые модели

```swift
// MARK: - Auth

struct TokenResponse: Codable {
    let access_token: String
    let token_type: String
}

struct UserProfile: Codable {
    let id: Int
    let first_name: String
    let last_name: String
    let email: String
    let created_at: String  // ISO 8601
}

// MARK: - Search

struct ObjectSearchResult: Codable {
    let id: Int
    let name: String
    let description: String?
    let object_type_id: Int
    let object_type_name: String
    let floor_id: Int
    let floor_name: String
    let structure_id: Int
    let structure_name: String
    let building_id: Int
    let building_name: String
    let campus_id: Int
    let campus_name: String
}

struct ObjectType: Codable {
    let id: Int
    let name: String
}

// MARK: - Tree

struct CampusTree: Codable {
    let id: Int
    let name: String
    let buildings: [BuildingTree]
}

struct BuildingTree: Codable {
    let id: Int
    let name: String
    let structures: [StructureTree]
}

struct StructureTree: Codable {
    let id: Int
    let name: String
    let floors: [FloorTreeItem]
}

struct FloorTreeItem: Codable {
    let id: Int
    let name: String
    let sort_order: Int
    let plan: PlanInfo
}

struct PlanInfo: Codable {
    let id: Int?
    let photo_url: String?
}

// MARK: - Object Detail

struct ObjectDetail: Codable {
    let id: Int
    let name: String
    let description: String?
    let object_type_id: Int
    let object_type_name: String
    let floor_id: Int
    let floor_name: String
    let structure_id: Int
    let structure_name: String
    let building_id: Int
    let building_name: String
    let campus_id: Int
    let campus_name: String
    let plan_id: Int?
    let plan_photo_url: String?
    let polygon_points: [[String: Double]]?  // [{"x": 100, "y": 200}, ...]
    let nav_node_id: Int?
}

// MARK: - Floor Plan

struct FloorWithPlan: Codable {
    let id: Int
    let name: String
    let sort_order: Int
    let plan_id: Int?
    let plan_photo_url: String?
}

struct FloorPlanResponse: Codable {
    let floor_id: Int
    let floor_name: String
    let plan_id: Int?
    let plan_photo_url: String?
    let objects: [ObjectOnPlan]
}

struct ObjectOnPlan: Codable {
    let id: Int
    let name: String
    let description: String?
    let object_type: ObjectType
    let polygon_points: [[String: Double]]?
    let nav_node_id: Int?
}
```

---

## Экран «Авторизация»

### POST /auth/login

```json
// Запрос
{ "email": "user@example.com", "password": "secret" }

// Ответ 200
{ "access_token": "eyJ...", "token_type": "bearer" }

// Ошибка 401
{ "detail": "Invalid credentials" }
```

Сохрани `access_token` в Keychain. Переходи на экран поиска.

---

## Экран «Регистрация»

### POST /auth/register

```json
// Запрос
{
  "first_name": "Иван",
  "last_name": "Иванов",
  "email": "user@example.com",
  "password": "secret"
}

// Ответ 201
{ "access_token": "eyJ...", "token_type": "bearer" }

// Ошибка 409
{ "detail": "Email already registered" }
```

После успешной регистрации токен выдаётся сразу — дополнительный логин не нужен.

---

## Экран «Профиль»

Все эндпоинты требуют `Authorization: Bearer <token>`.

### GET /auth/me

```json
// Ответ 200
{
  "id": 1,
  "first_name": "Иван",
  "last_name": "Иванов",
  "email": "user@example.com",
  "created_at": "2026-04-05T10:00:00Z"
}
```

### PATCH /auth/me

Все поля опциональны — отправляй только то, что изменилось.

```json
// Запрос
{ "first_name": "Пётр", "last_name": "Петров", "email": "new@example.com" }

// Ответ 200 — обновлённый профиль (та же структура, что GET /auth/me)

// Ошибка 409
{ "detail": "Email already in use" }
```

### POST /auth/change-password

```json
// Запрос
{ "old_password": "secret", "new_password": "newsecret" }

// Ответ 204 (пустое тело)

// Ошибка 400
{ "detail": "Old password is incorrect" }
```

---

## Экран «Поиск объекта»

### GET /admin/object-types

Список типов для фильтра. Загружай один раз при старте приложения.

```json
// Ответ 200
[
  { "id": 1, "name": "Аудитория" },
  { "id": 2, "name": "Лаборатория" },
  { "id": 3, "name": "Туалет" }
]
```

### GET /mobile/objects/search

| Параметр | Тип | Описание |
| --- | --- | --- |
| `q` | string, опц. | Подстрока в названии (регистронезависимо) |
| `type_id` | int, опц. | Фильтр по типу объекта |

Максимум 100 результатов. Вызывай на каждое изменение строки поиска с дебаунсом ~300 мс.

```text
GET /mobile/objects/search?q=906
GET /mobile/objects/search?q=&type_id=1
GET /mobile/objects/search?q=физика&type_id=2
```

```json
// Ответ 200
[
  {
    "id": 5,
    "name": "906",
    "description": null,
    "object_type_id": 1,
    "object_type_name": "Аудитория",
    "floor_id": 1,
    "floor_name": "9 этаж",
    "structure_id": 1,
    "structure_name": "Главный корпус",
    "building_id": 1,
    "building_name": "Корпус А",
    "campus_id": 1,
    "campus_name": "Главный кампус"
  }
]
```

### GET /mobile/tree

Полное иерархическое дерево для отображения вложенного списка корпусов/этажей.  
Загружай один раз, кешируй локально.

```json
// Ответ 200
[
  {
    "id": 1,
    "name": "Главный кампус",
    "buildings": [
      {
        "id": 1,
        "name": "Корпус А",
        "structures": [
          {
            "id": 1,
            "name": "Главный корпус",
            "floors": [
              {
                "id": 1,
                "name": "9 этаж",
                "sort_order": 9,
                "plan": {
                  "id": 1,
                  "photo_url": "http://localhost:9000/plans/1/floor.png?X-Amz-Signature=..."
                }
              }
            ]
          }
        ]
      }
    ]
  }
]
```

> `plan.photo_url` — presigned URL, истекает через 7 дней. Не кешируй его надолго.

---

## Экран «Планы помещений»

### Сценарий открытия

1. Пользователь выбирает корпус — из дерева (`/mobile/tree`) берёшь `structure_id`
2. Загружаешь список этажей корпуса
3. Отображаешь план выбранного этажа с полигонами объектов

### GET /mobile/structures/{structure_id}/floors

Список этажей корпуса с планами — для переключателя этажей.

```json
// Ответ 200
[
  { "id": 1, "name": "1 этаж", "sort_order": 1, "plan_id": 1, "plan_photo_url": "http://..." },
  { "id": 2, "name": "2 этаж", "sort_order": 2, "plan_id": 2, "plan_photo_url": "http://..." }
]
```

Сортировка уже по `sort_order`.

### GET /mobile/floors/{floor_id}/plan

Изображение плана + все объекты с полигонами.

```json
// Ответ 200
{
  "floor_id": 1,
  "floor_name": "9 этаж",
  "plan_id": 1,
  "plan_photo_url": "http://localhost:9000/plans/...",
  "objects": [
    {
      "id": 5,
      "name": "906",
      "description": null,
      "object_type": { "id": 1, "name": "Аудитория" },
      "polygon_points": [
        { "x": 255.43, "y": 472.19 },
        { "x": 354.12, "y": 472.19 },
        { "x": 354.12, "y": 530.45 },
        { "x": 255.43, "y": 530.45 }
      ],
      "nav_node_id": 12
    }
  ]
}
```

### Отрисовка плана в SwiftUI

```swift
// Фоновое изображение + полигоны поверх
struct FloorPlanView: View {
    let plan: FloorPlanResponse
    let imageSize: CGSize   // реальный размер загруженного изображения

    var body: some View {
        ZoomableScrollView {
            ZStack(alignment: .topLeading) {
                // 1. Фоновое изображение плана
                AsyncImage(url: URL(string: plan.plan_photo_url ?? "")) { img in
                    img.resizable().scaledToFit()
                } placeholder: { ProgressView() }

                // 2. Полигоны объектов поверх
                Canvas { context, size in
                    for obj in plan.objects {
                        guard let pts = obj.polygon_points, pts.count >= 3 else { continue }
                        var path = Path()
                        let scaled = pts.map {
                            CGPoint(
                                x: $0["x"]! / imageSize.width  * size.width,
                                y: $0["y"]! / imageSize.height * size.height
                            )
                        }
                        path.move(to: scaled[0])
                        scaled.dropFirst().forEach { path.addLine(to: $0) }
                        path.closeSubpath()
                        context.fill(path, with: .color(.blue.opacity(0.25)))
                        context.stroke(path, with: .color(.blue), lineWidth: 1.5)
                    }
                }
            }
        }
    }
}
```

> **Важно:** координаты `polygon_points` — в пикселях относительно исходного изображения плана. Масштабируй пропорционально реальному размеру `<Image>` на экране.

### Нажатие на объект

Hit-test: при тапе по плану проверяй, попадает ли точка касания в один из полигонов:

```swift
func objectAt(tapPoint: CGPoint, in size: CGSize, imageSize: CGSize) -> ObjectOnPlan? {
    for obj in plan.objects {
        guard let pts = obj.polygon_points, pts.count >= 3 else { continue }
        var path = Path()
        let scaled = pts.map {
            CGPoint(
                x: $0["x"]! / imageSize.width  * size.width,
                y: $0["y"]! / imageSize.height * size.height
            )
        }
        path.move(to: scaled[0])
        scaled.dropFirst().forEach { path.addLine(to: $0) }
        path.closeSubpath()
        if path.contains(tapPoint) { return obj }
    }
    return nil
}
```

---

## Экран «Информация об объекте»

### GET /mobile/objects/{object_id}

```json
// Ответ 200
{
  "id": 5,
  "name": "906",
  "description": "Лекционная аудитория на 120 мест",
  "object_type_id": 1,
  "object_type_name": "Аудитория",
  "floor_id": 1,
  "floor_name": "9 этаж",
  "structure_id": 1,
  "structure_name": "Главный корпус",
  "building_id": 1,
  "building_name": "Корпус А",
  "campus_id": 1,
  "campus_name": "Главный кампус",
  "plan_id": 1,
  "plan_photo_url": "http://localhost:9000/plans/...",
  "polygon_points": [ {"x": 255.43, "y": 472.19}, ... ],
  "nav_node_id": 12
}
```

Для отображения SVG-фрагмента с выделенным объектом:

- Загрузи `plan_photo_url`
- Нарисуй `polygon_points` поверх с выделением
- Отцентрируй вьюпорт на полигоне

---

## Экран «Маршрут» и «Активная навигация»

### POST /mobile/route

```json
// Запрос
{ "from_object_id": 3, "to_object_id": 5 }
```

```json
// Ответ 200
{
  "from_object_id": 3,
  "to_object_id": 5,
  "total_distance": 47.3,
  "steps": [
    {
      "step": 1,
      "instruction": "Выйдите из «Деканат»",
      "node_id": 10,
      "node_type": "room",
      "node_name": "Деканат",
      "plan_id": 1,
      "floor_name": "9 этаж",
      "x": 382.07,
      "y": 314.02
    },
    {
      "step": 2,
      "instruction": "Следуйте по коридору К9",
      "node_id": 11,
      "node_type": "corridor",
      "node_name": "К9",
      "plan_id": 1,
      "floor_name": "9 этаж",
      "x": 500.0,
      "y": 314.02
    },
    {
      "step": 3,
      "instruction": "По лестнице Лест-А перейдите на 1 этаж",
      "node_id": 20,
      "node_type": "stairs",
      "node_name": "Лест-А",
      "plan_id": 1,
      "floor_name": "9 этаж",
      "x": 650.0,
      "y": 200.0
    },
    {
      "step": 4,
      "instruction": "Войдите в «906»",
      "node_id": 55,
      "node_type": "room",
      "node_name": "906",
      "plan_id": 2,
      "floor_name": "1 этаж",
      "x": 300.0,
      "y": 400.0
    }
  ],
  "segments": [
    {
      "plan_id": 1,
      "floor_name": "9 этаж",
      "plan_photo_url": "http://localhost:9000/plans/1/floor9.png?X-Amz-Signature=...",
      "polyline": [
        { "x": 382.07, "y": 314.02 },
        { "x": 500.0,  "y": 314.02 },
        { "x": 650.0,  "y": 200.0  }
      ]
    },
    {
      "plan_id": 2,
      "floor_name": "1 этаж",
      "plan_photo_url": "http://localhost:9000/plans/2/floor1.png?X-Amz-Signature=...",
      "polyline": [
        { "x": 300.0, "y": 400.0 }
      ]
    }
  ]
}
```

Ошибки:

| Код | Причина |
| --- | --- |
| 400 | Объект не найден / у объекта не назначена точка входа / маршрут не существует |

```json
// 400
{ "detail": "Object 3 has no nav_node assigned" }
{ "detail": "No route found between the two objects" }
```

---

### Как использовать ответ

**`steps`** — для экрана «Активная навигация»:

- Показывай по одному шагу
- `instruction` — текст подсказки
- `node_type` — иконка направления
- При смене `plan_id` — показывай уведомление о переходе на другой этаж

**`segments`** — для отрисовки маршрута на плане:

- Каждый сегмент = один этаж
- `polyline` — координаты в пикселях относительно изображения плана
- Масштабируй аналогично `polygon_points` (см. раздел «Планы помещений»)

### Swift-модели

```swift
struct RouteRequest: Codable {
    let from_object_id: Int
    let to_object_id: Int
}

struct RouteStep: Codable {
    let step: Int
    let instruction: String
    let node_id: Int
    let node_type: String
    let node_name: String?
    let plan_id: Int
    let floor_name: String
    let x: Double
    let y: Double
}

struct PlanSegment: Codable {
    let plan_id: Int
    let floor_name: String
    let plan_photo_url: String?
    let polyline: [[String: Double]]  // [{"x": ..., "y": ...}]
}

struct RouteResponse: Codable {
    let from_object_id: Int
    let to_object_id: Int
    let total_distance: Double  // метры
    let steps: [RouteStep]
    let segments: [PlanSegment]
}
```

### Добавить в APIClient

```swift
func buildRoute(fromObjectId: Int, toObjectId: Int) async throws -> RouteResponse {
    let body = RouteRequest(from_object_id: fromObjectId, to_object_id: toObjectId)
    let data = try await request("/mobile/route", method: "POST", body: body)
    return try JSONDecoder().decode(RouteResponse.self, from: data)
}
```

### Отрисовка маршрута на плане (SwiftUI)

```swift
// Поверх FloorPlanView добавь полилинию маршрута
Canvas { context, size in
    // Полигоны объектов (как раньше)
    // ...

    // Маршрут текущего сегмента
    if let segment = currentSegment {
        var path = Path()
        let pts = segment.polyline.map {
            CGPoint(
                x: $0["x"]! / imageSize.width  * size.width,
                y: $0["y"]! / imageSize.height * size.height
            )
        }
        guard pts.count >= 2 else { return }
        path.move(to: pts[0])
        pts.dropFirst().forEach { path.addLine(to: $0) }
        context.stroke(path, with: .color(.red), style: StrokeStyle(lineWidth: 3, dash: [8, 4]))

        // Точки на маршруте
        for pt in pts {
            context.fill(Path(ellipseIn: CGRect(x: pt.x - 4, y: pt.y - 4, width: 8, height: 8)),
                         with: .color(.red))
        }
    }
}
```

---

## Хранение токена (Keychain)

```swift
import Security

struct KeychainHelper {
    static let service = "vkrb.navigator"

    static func save(token: String) {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "access_token",
            kSecValueData as String:   data
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "access_token",
            kSecReturnData as String:  true
        ]
        var result: AnyObject?
        SecItemCopyMatching(query as CFDictionary, &result)
        guard let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete() {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "access_token"
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

---

## HTTP-клиент (пример)

```swift
class APIClient {
    static let shared = APIClient()
    let base = URL(string: "http://localhost:8000")!

    private func request(_ path: String, method: String = "GET", body: Encodable? = nil) async throws -> Data {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = KeychainHelper.load() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as! HTTPURLResponse).statusCode
        guard (200..<300).contains(status) else {
            throw APIError.http(status: status, data: data)
        }
        return data
    }

    func login(email: String, password: String) async throws -> TokenResponse {
        let body = ["email": email, "password": password]
        let data = try await request("/auth/login", method: "POST", body: body)
        return try JSONDecoder().decode(TokenResponse.self, from: data)
    }

    func me() async throws -> UserProfile {
        let data = try await request("/auth/me")
        return try JSONDecoder().decode(UserProfile.self, from: data)
    }

    func searchObjects(q: String, typeId: Int? = nil) async throws -> [ObjectSearchResult] {
        var path = "/mobile/objects/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        if let typeId { path += "&type_id=\(typeId)" }
        let data = try await request(path)
        return try JSONDecoder().decode([ObjectSearchResult].self, from: data)
    }

    func tree() async throws -> [CampusTree] {
        let data = try await request("/mobile/tree")
        return try JSONDecoder().decode([CampusTree].self, from: data)
    }

    func floors(structureId: Int) async throws -> [FloorWithPlan] {
        let data = try await request("/mobile/structures/\(structureId)/floors")
        return try JSONDecoder().decode([FloorWithPlan].self, from: data)
    }

    func floorPlan(floorId: Int) async throws -> FloorPlanResponse {
        let data = try await request("/mobile/floors/\(floorId)/plan")
        return try JSONDecoder().decode(FloorPlanResponse.self, from: data)
    }

    func objectDetail(id: Int) async throws -> ObjectDetail {
        let data = try await request("/mobile/objects/\(id)")
        return try JSONDecoder().decode(ObjectDetail.self, from: data)
    }

    func objectTypes() async throws -> [ObjectType] {
        let data = try await request("/admin/object-types")
        return try JSONDecoder().decode([ObjectType].self, from: data)
    }
}

enum APIError: Error {
    case http(status: Int, data: Data)
}
```

---

## Сводная таблица эндпоинтов

| Метод | URL | Auth | Экран |
| --- | --- | --- | --- |
| POST | /auth/register | — | Регистрация |
| POST | /auth/login | — | Авторизация |
| GET | /auth/me | ✓ | Профиль |
| PATCH | /auth/me | ✓ | Профиль |
| POST | /auth/change-password | ✓ | Профиль |
| GET | /admin/object-types | — | Поиск (фильтр) |
| GET | /mobile/objects/search | — | Поиск |
| GET | /mobile/tree | — | Поиск, Планы |
| GET | /mobile/objects/{id} | — | Информация об объекте |
| GET | /mobile/structures/{id}/floors | — | Планы (переключатель этажей) |
| GET | /mobile/floors/{id}/plan | — | Планы (план + полигоны) |
| POST | /mobile/route | — | Маршрут ⚠️ не реализован |
