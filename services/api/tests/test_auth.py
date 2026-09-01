from httpx import AsyncClient


async def test_register_sets_session_cookies(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    assert response.status_code == 201
    assert response.json()["email"] == "ada@example.com"
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


async def test_register_duplicate_email_conflicts(client: AsyncClient) -> None:
    body = {"email": "ada@example.com", "password": "correct horse battery"}
    await client.post("/auth/register", json=body)
    response = await client.post("/auth/register", json=body)
    assert response.status_code == 409


async def test_login_wrong_password_rejected(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    response = await client.post(
        "/auth/login", json={"email": "ada@example.com", "password": "wrong password"}
    )
    assert response.status_code == 401


async def test_login_then_me_returns_current_user(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    login = await client.post(
        "/auth/login", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    assert login.status_code == 200

    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"


async def test_me_without_session_is_unauthorized(client: AsyncClient) -> None:
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_logout_clears_session(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    await client.post("/auth/logout")
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_update_me_sets_timezone_and_day_start_hour(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    response = await client.patch(
        "/users/me", json={"timezone": "America/New_York", "day_start_hour": 3}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["timezone"] == "America/New_York"
    assert body["day_start_hour"] == 3

    me = await client.get("/auth/me")
    assert me.json()["timezone"] == "America/New_York"
    assert me.json()["day_start_hour"] == 3


async def test_update_me_rejects_unknown_timezone(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    response = await client.patch("/users/me", json={"timezone": "Not/AZone"})
    assert response.status_code == 422


async def test_update_me_rejects_out_of_range_day_start_hour(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    response = await client.patch("/users/me", json={"day_start_hour": 24})
    assert response.status_code == 422


async def test_update_me_requires_auth(client: AsyncClient) -> None:
    response = await client.patch("/users/me", json={"day_start_hour": 5})
    assert response.status_code == 401


async def test_update_me_leaves_unspecified_fields_unchanged(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    await client.patch("/users/me", json={"timezone": "Europe/Paris"})
    response = await client.patch("/users/me", json={"day_start_hour": 6})
    assert response.status_code == 200
    assert response.json()["timezone"] == "Europe/Paris"
    assert response.json()["day_start_hour"] == 6
