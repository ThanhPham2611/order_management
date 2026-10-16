"use client";

import { useState } from "react";

import { OrderBoard } from "@/features/orders/components/order-board";
import { getDefaultOrderRepository } from "@/features/orders/data/repositories";

export function OrderBoardApp() {
  const [source] = useState(getDefaultOrderRepository);
  return <OrderBoard repository={source.repository} isDemo={source.isDemo} />;
}

