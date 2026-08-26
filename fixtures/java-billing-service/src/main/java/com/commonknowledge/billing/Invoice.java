package com.commonknowledge.billing;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;

public record Invoice(CustomerAccount customer, BigDecimal amountDue, LocalDate closeDate) {
  public Invoice {
    Objects.requireNonNull(customer, "customer");
    Objects.requireNonNull(amountDue, "amountDue");
    Objects.requireNonNull(closeDate, "closeDate");
  }
}
