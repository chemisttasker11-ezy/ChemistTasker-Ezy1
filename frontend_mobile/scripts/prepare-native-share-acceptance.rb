require 'fileutils'
gem 'xcodeproj', '= 1.27.0'
require 'xcodeproj'

# Build a standalone simulator UI-test runner. No application source, generated
# application project, signing entitlement, or installed app is modified.
destination = File.expand_path(ARGV.fetch(0))
FileUtils.mkdir_p(destination)
project = Xcodeproj::Project.new(File.join(destination, 'NativeShareAcceptance.xcodeproj'))
target = project.new_target(:ui_test_bundle, 'NativeShareAcceptance', :ios, '15.1')
source = project.main_group.new_file(File.expand_path('native-share-acceptance.swift', __dir__))
target.source_build_phase.add_file_reference(source)
target.build_configurations.each do |configuration|
  configuration.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.chemisttasker.native-share-acceptance',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'SWIFT_VERSION' => '5.0',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'CODE_SIGN_STYLE' => 'Manual',
    'CODE_SIGN_IDENTITY' => '-',
    'DEVELOPMENT_TEAM' => '',
    'PROVISIONING_PROFILE_SPECIFIER' => ''
  )
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(target)
scheme.add_test_target(target)
scheme.test_action.build_configuration = 'Debug'
scheme.save_as(project.path, 'NativeShareAcceptance', true)
