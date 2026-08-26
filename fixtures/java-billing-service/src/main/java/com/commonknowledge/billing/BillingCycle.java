package com.commonknowledge.billing;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Objects;

public final class BillingCycle {
  private final Clock clock;

  public BillingCycle(Clock clock) {
    this.clock = Objects.requireNonNull(clock, "clock");
  }

  public Invoice createMonthlyInvoice(CustomerAccount customer, BigDecimal amountDue) {
    LocalDate closeDate = LocalDate.now(clock.withZone(ZoneId.systemDefault()));
    return new Invoice(customer, amountDue, closeDate);
  }
}
