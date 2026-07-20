"""Orders for generated artifacts: status is provider truth, never a claim (#53, D17).

The single rule this package exists to enforce: an order's status changes ONLY
as a result of a server-side verify-transaction call to Monnify. A customer
saying "I have sent the money" triggers a verification, not a status change.
That rule is what makes the fake-credit-alert demo beat honest.
"""

from .service import LineItem, Order, OrderStatus, OrdersService, orders_service

__all__ = ["LineItem", "Order", "OrderStatus", "OrdersService", "orders_service"]
