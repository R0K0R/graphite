class AppException implements Exception {
  const AppException(this.message, {this.cause});

  final String message;
  final Object? cause;

  @override
  String toString() {
    if (cause == null) {
      return 'AppException: $message';
    }
    return 'AppException: $message ($cause)';
  }
}
